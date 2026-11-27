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

  const is24 = (slug: string) => ({ type: "url", url: `https://www.immobilienscout24.de/anbieter/profil/${slug}/x` });

  it("imports every ICP value, excludes RAUS/vorfilter, skips Notion duplicates", () => {
    const plan = planSync(
      [
        mapNotionPage(page({ ...base, ICP: sel("RAUS"), "IS24 URL": is24("a") }, "a")),
        mapNotionPage(page({ ...base, enrich_status: sel("duplikat"), "IS24 URL": is24("b") }, "b")),
        mapNotionPage(page({ ...base, ICP: sel("Grenzfall"), "Call-Status": sel(null), "IS24 URL": is24("c"), Firma: title("Grenz GmbH") }, "c")),
        mapNotionPage(page({ ...base, ICP: sel(null), enrich_status: sel("vorfilter"), "IS24 URL": is24("d"), Firma: title("Vor GmbH") }, "d")),
      ],
      [],
      opts,
    );
    expect(plan.skipped.map((s) => s.reason)).toEqual(["enrich"]);
    const byId = Object.fromEntries(plan.create.map((c) => [c.lead.pageId, c]));
    expect(byId.a.lead).toMatchObject({ icp: "RAUS", status: "disqualified", excluded: "ICP raus laut Notion" });
    expect(byId.a.wv).toBeNull();
    expect(byId.c.lead).toMatchObject({ icp: "Grenzfall", status: "neu", excluded: null });
    expect(byId.d.lead).toMatchObject({ icp: "offen", status: "disqualified" });
  });

  it("excludes „Kein Interesse“ regardless of ICP", () => {
    const lead = mapNotionPage(page({ ...base, ICP: sel("Grenzfall"), "Call-Status": sel("Kein Interesse") }));
    expect(lead).toMatchObject({ status: "disqualified", excluded: "Kein Interesse laut Notion" });
    expect(lead.notiz).toContain("Nicht erneut kontaktieren");
  });

  it("derives a missing company name from the IS24 profile", () => {
    const lead = mapNotionPage(
      page({ ...base, Firma: title(""), "IS24 URL": { type: "url", url: "https://www.immobilienscout24.de/anbieter/profil/haehnlein-und-kroenert/thomas-kroenert" } }),
    );
    expect(lead.firma).toBe("Hähnlein und Krönert");
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
    const plan = planSync([mapNotionPage(page(base))], [company({ telefon: "+49 1", notion_id: "p1", icp: "JA" })], opts);
    const u = plan.update[0];
    expect(u.patch.telefon).toBeUndefined();
    expect(u.patch.notion_id).toBeUndefined();
    expect(u.patch).toMatchObject({ crm_system: "onOffice", inserate_aktiv: 12, meta_ads: true });
    expect(u.setStatus).toEqual({ status: "kein_anschluss_1", wv: null });
  });

  it("first link sets notion_id and ICP and brings the research note", () => {
    const plan = planSync([mapNotionPage(page({ ...base, "Call-Status": sel(null) }))], [company({ telefon: "+49 1" })], opts);
    const u = plan.update[0];
    expect(u.patch).toMatchObject({ notion_id: "p1", icp: "JA" });
    expect(u.note?.sourceKey).toMatch(/^notion:p1:[0-9a-f]{8}$/);
  });

  it("no new note for an already linked, unchanged page", () => {
    const plan = planSync([mapNotionPage(page({ ...base, "Call-Status": sel(null) }))], [company({ notion_id: "p1", icp: "JA", crm_system: "onOffice", inserate_aktiv: 12, meta_ads: true, quell_url: base["IS24 URL"].url, telefon: "x" })], opts);
    expect(plan.update).toHaveLength(0);
  });

  it("never overwrites CRM progress, reports a conflict for newer Notion edits", () => {
    const edited = page({ ...base, "Call-Status": sel("Rückruf") }, "p1", "2026-11-28T09:00:00.000Z");
    const plan = planSync([mapNotionPage(edited)], [company({ pipeline_status: "kein_anschluss_2", notion_id: "p1" })], opts);
    expect(plan.update[0]?.setStatus ?? null).toBeNull();
    expect(plan.conflicts).toEqual([{ firma: "Muster Immobilien GmbH", companyId: "c1", crm: "kein_anschluss_2", notion: "Rückruf" }]);
    expect(plan.update[0].note?.sourceKey).toMatch(/^notion:p1:[0-9a-f]{8}$/);
  });

  it("„Kein Interesse“ in Notion excludes an open CRM lead", () => {
    const ki = page({ ...base, "Call-Status": sel("Kein Interesse") });
    const plan = planSync([mapNotionPage(ki)], [company({ pipeline_status: "kontaktiert" })], opts);
    expect(plan.update[0].setStatus).toEqual({ status: "disqualified", wv: null });
    expect(plan.conflicts).toHaveLength(0);
  });

  it("ICP raus excludes untouched leads but not ones in an active conversation", () => {
    const raus = mapNotionPage(page({ ...base, ICP: sel("RAUS"), "Call-Status": sel(null) }));
    expect(planSync([raus], [company({ pipeline_status: "neu" })], opts).update[0].setStatus).toEqual({ status: "disqualified", wv: null });
    const busy = planSync([raus], [company({ pipeline_status: "callback" })], opts);
    expect(busy.update[0]?.setStatus ?? null).toBeNull();
    expect(busy.conflicts[0]).toMatchObject({ crm: "callback" });
  });

  it("„Kein Interesse“ does not override a booked appointment, reports a conflict", () => {
    const ki = page({ ...base, "Call-Status": sel("Kein Interesse") });
    const plan = planSync([mapNotionPage(ki)], [company({ pipeline_status: "set_appointment" })], opts);
    expect(plan.update[0]?.setStatus ?? null).toBeNull();
    expect(plan.conflicts[0]).toMatchObject({ crm: "set_appointment" });
  });

  it("matches renamed companies by website domain, phone and contact person", () => {
    const lead = mapNotionPage(
      page({
        ...base,
        Firma: title("deinimmoberater"),
        "IS24 URL": is24("deinimmoberater"),
        Ansprechpartner: text("Daniel Gebhardt"),
        Website: { type: "url", url: "https://www.deinimmoberater.de/team" },
        "Telefon (enrich)": { type: "phone_number", phone_number: "+49 (0) 228 555 123" },
      }),
    );
    const other = { name: "deinimmo GmbH", stadt: null, quell_url: null };
    expect(planSync([lead], [company({ ...other, website: "deinimmoberater.de" })], opts).update[0].matchedBy).toBe("domain");
    expect(planSync([lead], [company({ ...other, telefon: "0228 555123" })], opts).update[0].matchedBy).toBe("telefon");
    expect(
      planSync([lead], [company({ ...other, people: [{ name: "Daniel Gebhardt", email: null, telefon: null }] })], opts).update[0].matchedBy,
    ).toBe("person");
  });

  it("does not match by a contact name that exists in several companies", () => {
    const lead = mapNotionPage(page({ ...base, Firma: title("X GmbH"), "IS24 URL": is24("x"), Ansprechpartner: text("Andre Müller") }));
    const p = [{ name: "Andre Müller", email: null, telefon: null }];
    const plan = planSync([lead], [company({ id: "a", name: "A", stadt: null, people: p }), company({ id: "b", name: "B", stadt: null, people: p })], opts);
    expect(plan.create).toHaveLength(1);
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
