import { describe, expect, it } from "vitest";
import {
  blocksToText,
  cleanFirma,
  is24Key,
  mapNotionPage,
  mapStatus,
  parsePerson,
  planSync,
  type ExistingCompany,
  type NotionPage,
} from "./notionSync";

const title = (s: string) => ({ type: "title", title: [{ plain_text: s }] });
const text = (s: string) => ({ type: "rich_text", rich_text: [{ plain_text: s }] });
const sel = (s: string | null) => ({ type: "select", select: s ? { name: s } : null });

function page(props: Record<string, unknown>, id = "p1", edited = "2026-11-20T10:00:00.000Z"): NotionPage {
  return { id, last_edited_time: edited, properties: props as NotionPage["properties"] };
}

const base = {
  Firma: title("Muster Immobilien GmbH"),
  Stadt: text("Köln"),
  ICP: sel("JA"),
  "Call-Status": sel("Nicht erreicht"),
  "IS24 URL": { type: "url", url: "https://www.immobilienscout24.de/anbieter/profil/muster/max-muster" },
  "Telefon (enrich)": { type: "phone_number", phone_number: "+49 221 123" },
  Ansprechpartner: text("Max Muster - Insta 10k"),
  CRM: text("onOffice"),
  Inserate: { type: "number", number: 12 },
  "Meta Ads live": sel("ja"),
  "Nächster Anruf": { type: "date", date: null },
};

const company = (over: Partial<ExistingCompany> = {}): ExistingCompany => ({
  id: "c1",
  name: "Muster Immobilien GmbH",
  stadt: "Köln",
  quell_url: null,
  pipeline_status: "neu",
  telefon: null,
  website: null,
  instagram_url: null,
  crm_system: null,
  inserate_aktiv: null,
  meta_ads: null,
  ...over,
});

const opts = { lastSync: "2026-11-26T18:00:00.000Z", today: "2026-11-26" };

describe("mapping", () => {
  it("maps statuses, unknown → neu", () => {
    expect(mapStatus("nicht erreicht 2")).toBe("kein_anschluss_2");
    expect(mapStatus("buying window FU")).toBe("later");
    expect(mapStatus("urgent")).toBe("callback");
    expect(mapStatus("Kein Interesse")).toBe("disqualified");
    expect(mapStatus("irgendwas")).toBe("neu");
    expect(mapStatus(null)).toBe("neu");
  });

  it("cleans person names from call notes", () => {
    expect(parsePerson("Dirk Seifert 17  uhr").name).toBe("Dirk Seifert");
    expect(parsePerson("Oliver Freytag - PODCAST CLIP").name).toBe("Oliver Freytag");
    expect(parsePerson("Daniel Wessa (GF/Broker Owner) | mailto:daniel@x.de")).toEqual({
      name: "Daniel Wessa",
      rolle: "GF/Broker Owner",
      email: "daniel@x.de",
    });
  });

  it("removes link artefacts from company names", () => {
    expect(cleanFirma("Schürrer & Fleischer GmbH & http://Co.KG")).toBe("Schürrer & Fleischer GmbH & Co.KG");
    expect(cleanFirma("http://Skyline-Immobilien.com GmbH")).toBe("Skyline-Immobilien.com GmbH");
  });

  it("normalizes IS24 keys", () => {
    expect(is24Key("https://www.immobilienscout24.de/anbieter/profil/a/b/?x=1")).toBe("/anbieter/profil/a/b");
    expect(is24Key("https://example.de")).toBeNull();
  });

  it("maps a page into a lead", () => {
    const lead = mapNotionPage(page(base), "", "2026-11-26");
    expect(lead).toMatchObject({
      firma: "Muster Immobilien GmbH",
      status: "kein_anschluss_1",
      crm: "onOffice",
      inserate: 12,
      meta: true,
      person: { name: "Max Muster" },
    });
    expect(lead.notiz).toContain("Ansprechpartner (Notion): Max Muster - Insta 10k");
  });

  it("turns blocks into text", () => {
    expect(
      blocksToText([
        { type: "heading_2", heading_2: { rich_text: [{ plain_text: "E-Mail" }] } },
        { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Hallo" }] } },
        { type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "Punkt" }] } },
      ]),
    ).toBe("E-Mail\nHallo\n• Punkt");
  });
});

describe("planSync", () => {
  it("creates unknown leads with a spread follow-up date", () => {
    const plan = planSync([mapNotionPage(page(base))], [], opts);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].wv).toBe("2026-11-30"); // 2 Werktage nach Do → Mo
  });

  it("parks „buying window FU“ as Später with a follow-up in ~3 months", () => {
    const plan = planSync([mapNotionPage(page({ ...base, "Call-Status": sel("buying window FU") }))], [], opts);
    expect(plan.create[0].lead.status).toBe("later");
    expect(plan.create[0].wv).toBe("2027-02-25");
  });

  it("skips non-JA, prefiltered and nameless rows", () => {
    const plan = planSync(
      [
        mapNotionPage(page({ ...base, ICP: sel("RAUS") }, "a")),
        mapNotionPage(page({ ...base, enrich_status: sel("duplikat") }, "b")),
        mapNotionPage(page({ ...base, Firma: title("") }, "c")),
      ],
      [],
      opts,
    );
    expect(plan.skipped.map((s) => s.reason)).toEqual(["icp", "enrich", "ohne_name"]);
    expect(plan.create).toHaveLength(0);
  });

  it("matches by IS24 URL even if the name changed", () => {
    const plan = planSync(
      [mapNotionPage(page(base))],
      [company({ name: "Ganz anders GmbH", quell_url: "https://www.immobilienscout24.de/anbieter/profil/muster/max-muster" })],
      opts,
    );
    expect(plan.create).toHaveLength(0);
    expect(plan.update[0].matchedBy).toBe("is24");
  });

  it("only fills empty fields and sets status while CRM is still neu", () => {
    const plan = planSync([mapNotionPage(page(base))], [company({ telefon: "+49 1" })], opts);
    const u = plan.update[0];
    expect(u.patch.telefon).toBeUndefined();
    expect(u.patch).toMatchObject({ crm_system: "onOffice", inserate_aktiv: 12, meta_ads: true });
    expect(u.setStatus).toEqual({ status: "kein_anschluss_1", wv: null });
    expect(u.note).toBeNull(); // vor dem letzten Sync bearbeitet → keine neue Notiz
  });

  it("never overwrites CRM progress, reports a conflict for newer Notion edits", () => {
    const edited = page({ ...base, "Call-Status": sel("Kein Interesse") }, "p1", "2026-11-28T09:00:00.000Z");
    const plan = planSync([mapNotionPage(edited)], [company({ pipeline_status: "callback" })], opts);
    expect(plan.update[0]?.setStatus ?? null).toBeNull();
    expect(plan.conflicts).toEqual([{ firma: "Muster Immobilien GmbH", companyId: "c1", crm: "callback", notion: "Kein Interesse" }]);
    expect(plan.update[0].note?.sourceKey).toMatch(/^notion:p1:[0-9a-f]{8}$/);
  });

  it("matches LinkedIn leads without city by name", () => {
    const plan = planSync([mapNotionPage(page(base))], [company({ stadt: null })], opts);
    expect(plan.update[0].matchedBy).toBe("name");
    expect(plan.update[0].patch.stadt).toBe("Köln");
  });

  it("keeps the note key stable across days", () => {
    const a = planSync([mapNotionPage(page(base, "p1", "2026-11-28T00:00:00Z"), "", "2026-11-28")], [company()], opts);
    const b = planSync([mapNotionPage(page(base, "p1", "2026-11-28T00:00:00Z"), "", "2026-11-29")], [company()], opts);
    expect(a.update[0].note?.sourceKey).toBe(b.update[0].note?.sourceKey);
  });
});
