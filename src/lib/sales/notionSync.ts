/**
 * Notion → CRM: Mapping und Abgleich der Datenbank „ImmoScout Makler Leads“.
 *
 * Reine Funktionen (kein Netzwerk, keine DB) – die Server-Aktion holt die
 * Notion-Seiten und die bestehenden Firmen und lässt hier den Plan rechnen.
 *
 * Regeln:
 * - Alle Zeilen werden übernommen; `icp` (JA/Grenzfall/RAUS/offen) wird mitgeführt.
 * - Ausgeschlossen (nie wieder ziehen): ICP RAUS, enrich_status „vorfilter“,
 *   Call-Status „Kein Interesse“/„kein bedarf“/„Falsche Nummer“.
 * - enrich_status „duplikat“ wird übersprungen (Dublette innerhalb von Notion).
 * - Abgleich: Notion-ID → IS24-Profil → Website-Domain → Telefon →
 *   Ansprechpartner → Name + Stadt → Name (wenn die CRM-Firma keine Stadt hat).
 * - Das CRM gewinnt: bestehende Leads bekommen nur leere Felder gefüllt; der
 *   Status wird nur übernommen, solange der Lead im CRM noch „Neu“ ist.
 *   Ausnahme: Ausschluss in Notion schließt auch bestehende Leads aus, außer sie
 *   sind schon weiter (Termin, Closing, Kunde) → Konflikt.
 * - Notizen sind idempotent (source_key = Seite + Inhalts-Hash).
 */

import { addBusinessDays, addCalendarWeeksSkipWeekend } from "./dates";

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

/** Minimale Form einer Notion-Seite aus `databases/{id}/query`. */
export type NotionPage = {
  id: string;
  last_edited_time: string;
  properties: Record<string, NotionProperty | undefined>;
};

type RichText = { plain_text?: string }[];
export type NotionProperty =
  | { type: "title"; title: RichText }
  | { type: "rich_text"; rich_text: RichText }
  | { type: "url"; url: string | null }
  | { type: "phone_number"; phone_number: string | null }
  | { type: "email"; email: string | null }
  | { type: "number"; number: number | null }
  | { type: "select"; select: { name: string } | null }
  | { type: "multi_select"; multi_select: { name: string }[] }
  | { type: "date"; date: { start: string } | null }
  | { type: string; [key: string]: unknown };

export type SyncStatus =
  | "neu"
  | "kein_anschluss_1"
  | "kein_anschluss_2"
  | "kein_anschluss_3"
  | "callback"
  | "later"
  | "set_appointment"
  | "disqualified";

export type NotionLead = {
  pageId: string;
  lastEdited: string;
  firma: string | null;
  stadt: string | null;
  telefon: string | null;
  website: string | null;
  instagram: string | null;
  is24: string | null;
  person: { name: string | null; rolle: string | null; email: string | null };
  icp: Icp;
  enrichStatus: string | null;
  notionStatus: string;
  status: SyncStatus;
  /** Grund, warum der Lead nie wieder kontaktiert werden soll (sonst null). */
  excluded: string | null;
  wv: string | null;
  crm: CrmSystem | null;
  inserate: number | null;
  meta: boolean | null;
  notiz: string;
};

export type CrmSystem = "onOffice" | "Propstack" | "FlowFact" | "FIO Webmakler" | "kein CRM";
export type Icp = "JA" | "Grenzfall" | "RAUS" | "offen";

/** Bestehende Firma, wie die Server-Aktion sie aus `sales.companies` lädt. */
export type ExistingCompany = {
  id: string;
  name: string;
  stadt: string | null;
  quell_url: string | null;
  pipeline_status: string;
  telefon: string | null;
  website: string | null;
  instagram_url: string | null;
  crm_system: string | null;
  inserate_aktiv: number | null;
  meta_ads: boolean | null;
  notion_id?: string | null;
  icp?: string | null;
  /** Ansprechpartner der Firma (für den Abgleich über Person/Telefon/E-Mail-Domain). */
  people?: { name: string; email: string | null; telefon: string | null }[];
};

export type CompanyPatch = Partial<{
  telefon: string;
  website: string;
  stadt: string;
  instagram_url: string;
  quell_url: string;
  crm_system: CrmSystem;
  inserate_aktiv: number;
  meta_ads: boolean;
  notion_id: string;
  icp: Icp;
}>;

export type MatchedBy = "notion" | "is24" | "domain" | "telefon" | "person" | "name_stadt" | "name";

export type SyncPlan = {
  create: { lead: NotionLead; wv: string | null; sourceKey: string }[];
  update: {
    lead: NotionLead;
    companyId: string;
    companyName: string;
    matchedBy: MatchedBy;
    patch: CompanyPatch;
    /** Notiz nur, wenn die Seite seit dem letzten Sync bearbeitet wurde. */
    note: { text: string; sourceKey: string } | null;
    /** Status setzen (Lead im CRM noch „Neu“). */
    setStatus: { status: SyncStatus; wv: string | null } | null;
  }[];
  conflicts: { firma: string; companyId: string; crm: string; notion: string }[];
  skipped: { firma: string | null; reason: SkipReason }[];
};

export type SkipReason = "enrich" | "ohne_name" | "doppelt_in_notion";

export const SKIP_LABELS: Record<SkipReason, string> = {
  enrich: "als Duplikat markiert in Notion",
  ohne_name: "ohne Firmenname",
  doppelt_in_notion: "doppelt in Notion",
};

// ---------------------------------------------------------------------------
// Eigenschaften lesen
// ---------------------------------------------------------------------------

function richText(rt: RichText | undefined): string {
  return (rt ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

/** Wert einer Notion-Eigenschaft als Text (leer → null). */
export function propText(p: NotionProperty | undefined): string | null {
  if (!p) return null;
  let v: string | null = null;
  switch (p.type) {
    case "title":
      v = richText((p as { title: RichText }).title);
      break;
    case "rich_text":
      v = richText((p as { rich_text: RichText }).rich_text);
      break;
    case "url":
      v = (p as { url: string | null }).url;
      break;
    case "phone_number":
      v = (p as { phone_number: string | null }).phone_number;
      break;
    case "email":
      v = (p as { email: string | null }).email;
      break;
    case "number": {
      const n = (p as { number: number | null }).number;
      v = n === null || n === undefined ? null : String(n);
      break;
    }
    case "select":
      v = (p as { select: { name: string } | null }).select?.name ?? null;
      break;
    case "multi_select":
      v = (p as { multi_select: { name: string }[] }).multi_select.map((o) => o.name).join(", ");
      break;
    case "date":
      v = (p as { date: { start: string } | null }).date?.start ?? null;
      break;
  }
  const t = v?.trim();
  return t ? t : null;
}

// ---------------------------------------------------------------------------
// Bereinigung
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, SyncStatus> = {
  "": "neu",
  offen: "neu",
  backlog: "neu",
  "nicht erreicht": "kein_anschluss_1",
  "nicht erreicht 2": "kein_anschluss_2",
  "nicht erreicht 3": "kein_anschluss_3",
  rückruf: "callback",
  "buying window fu": "later",
  urgent: "callback",
  urlaub: "callback",
  "gespräch geführt": "callback",
  gate: "callback",
  "termin gebucht": "set_appointment",
  "discovery gebucht": "set_appointment",
  "kein interesse": "disqualified",
  "kein bedarf": "disqualified",
  "falsche nummer": "disqualified",
};

export function mapStatus(notion: string | null): SyncStatus {
  return STATUS_MAP[(notion ?? "").trim().toLowerCase()] ?? "neu";
}

const CRM_KEYWORDS: [string, CrmSystem][] = [
  ["onoffice", "onOffice"],
  ["propstack", "Propstack"],
  ["flowfact", "FlowFact"],
  ["fio", "FIO Webmakler"],
  ["kein", "kein CRM"],
];

export function mapCrm(text: string | null): CrmSystem | null {
  const t = (text ?? "").toLowerCase();
  if (!t) return null;
  return CRM_KEYWORDS.find(([k]) => t.includes(k))?.[1] ?? null;
}

/** Notion-Titel enthalten teils Link-Artefakte („GmbH & http://Co.KG“). */
export function cleanFirma(name: string | null): string | null {
  if (!name) return null;
  const v = name.replace(/https?:\/\/(?=\S)/gi, "").replace(/\s+/g, " ").trim();
  return v || null;
}

/** „Dirk Seifert 17 uhr“, „Oliver Freytag - PODCAST …“ → nur der Name. */
export function parsePerson(raw: string | null): NotionLead["person"] {
  if (!raw) return { name: null, rolle: null, email: null };
  const email = raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]?.toLowerCase() ?? null;
  const first = raw.split("|")[0].replace(/mailto:\S+/g, "").trim();
  const rolle = first.match(/\(([^)]+)\)/)?.[1]?.trim() ?? null;
  const name = first
    .replace(/\([^)]*\)/g, "")
    .replace(/[,;\n][\s\S]*$/, "")
    .split(/\s+[-–]\s+/)[0]
    .replace(/\s+\d.*$/, "")
    .replace(/\s+(insta|website|uhr|ab|nur)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return { name: name && name.length <= 60 && !name.includes("@") ? name : null, rolle, email };
}

export function normalizeUrl(u: string | null): string | null {
  if (!u) return null;
  const t = u.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return /^[\w-]+(\.[\w-]+)+/.test(t) ? `https://${t}` : null;
}

/** Vergleichsschlüssel einer IS24-Profil-URL (ohne Protokoll/Slash/Query). */
export function is24Key(u: string | null): string | null {
  if (!u) return null;
  const m = u.toLowerCase().match(/immobilienscout24\.de(\/anbieter\/profil\/[^?#]+)/);
  return m ? m[1].replace(/\/+$/, "") : null;
}

export function mapIcp(v: string | null): Icp {
  const t = (v ?? "").trim().toLowerCase();
  if (t === "ja") return "JA";
  if (t === "grenzfall") return "Grenzfall";
  if (t === "raus") return "RAUS";
  return "offen";
}

const EXCLUDING_STATUS = new Set(["kein interesse", "kein bedarf", "falsche nummer"]);

/** Grund für einen dauerhaften Ausschluss (oder null). */
export function exclusionReason(icp: Icp, enrichStatus: string | null, notionStatus: string): string | null {
  const s = notionStatus.trim().toLowerCase();
  if (EXCLUDING_STATUS.has(s)) return `${notionStatus} laut Notion`;
  if (icp === "RAUS") return "ICP raus laut Notion";
  if ((enrichStatus ?? "").toLowerCase() === "vorfilter") return "Vorfilter in Notion (passt nicht)";
  return null;
}

const UMLAUT: [RegExp, string][] = [
  [/ae/g, "ä"],
  [/oe/g, "ö"],
  [/ue/g, "ü"],
];

/**
 * Firmenname aus dem IS24-Profil, wenn Notion keinen hat:
 * `/anbieter/profil/haehnlein-und-kroenert/thomas-kroenert` → „Hähnlein und Krönert“.
 */
export function firmaFromIs24(u: string | null): string | null {
  const k = is24Key(u);
  const slug = k?.split("/")[3];
  if (!slug) return null;
  const words = slug
    .replace(/-\d{4,5}(-.*)?$/, "")
    .split("-")
    .filter(Boolean)
    .map((w) => {
      let x = w;
      for (const [re, r] of UMLAUT) x = x.replace(re, r);
      return w === "und" || w === "gmbh" ? (w === "gmbh" ? "GmbH" : w) : x.charAt(0).toUpperCase() + x.slice(1);
    });
  return words.length ? words.join(" ") : null;
}

/** Vergleichsdomain einer Website/E-Mail (ohne www, ohne Portale). */
const GENERIC_DOMAINS = new Set([
  "immobilienscout24.de", "immowelt.de", "facebook.com", "instagram.com", "linkedin.com",
  "google.com", "gmail.com", "web.de", "gmx.de", "gmx.net", "t-online.de", "outlook.com",
  "hotmail.com", "yahoo.de", "icloud.com", "jacasa.de", "xing.com",
]);
export function domainKey(u: string | null): string | null {
  if (!u) return null;
  const t = u.trim().toLowerCase();
  const host = t.includes("@") ? t.split("@")[1] : t.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  const d = host?.replace(/^www\./, "").replace(/\.$/, "");
  if (!d || !d.includes(".") || GENERIC_DOMAINS.has(d)) return null;
  return d;
}

/** Telefonnummer vergleichbar machen: +49 / 0049 → 0, nur Ziffern, mind. 8 Stellen. */
export function phoneKey(p: string | null): string | null {
  if (!p) return null;
  let d = p.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
  if (d.startsWith("+49")) d = `0${d.slice(3)}`;
  else if (d.startsWith("0049")) d = `0${d.slice(4)}`;
  d = d.replace(/\D/g, "");
  return d.length >= 8 ? d : null;
}

export function nameKey(name: string | null): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim();
}

/** Kleiner, stabiler String-Hash (FNV-1a, 32 Bit, hex). */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Seite → Lead
// ---------------------------------------------------------------------------

/**
 * Quellneutrale Zeile: aus der Notion-API (Eigenschaften → Text) oder aus
 * einem Notion-Export (CSV-Spalten + Markdown-Seite).
 */
export type SourceRecord = {
  pageId: string;
  /** ISO-Zeitpunkt der letzten Bearbeitung in Notion. */
  lastEdited: string;
  fields: Record<string, string | null>;
  body?: string;
};

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** „2026-12-02“, „2026-12-02T…“ oder „December 2, 2026“ → `YYYY-MM-DD`. */
export function parseNotionDate(s: string | null): string | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.trim().match(/^([A-Za-z]+) (\d{1,2}), (\d{4})/);
  const mon = m ? MONTHS[m[1].toLowerCase()] : undefined;
  return m && mon ? `${m[3]}-${String(mon).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

export function mapNotionPage(page: NotionPage, body = "", today = "2026-01-01"): NotionLead {
  const fields: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(page.properties)) fields[k] = propText(v);
  return mapRecord({ pageId: page.id, lastEdited: page.last_edited_time, fields, body }, today);
}

export function mapRecord(rec: SourceRecord, today = "2026-01-01"): NotionLead {
  const body = rec.body ?? "";
  const t = (k: string) => {
    const v = rec.fields[k]?.trim();
    return v ? v : null;
  };
  const notionStatus = t("Call-Status") ?? "";
  const ansprechpartner = t("Ansprechpartner");
  const person = parsePerson(ansprechpartner);
  const team = t("Teamgröße");
  const fu = t("FU");
  const inserateRaw = t("Inserate");
  const metaRaw = t("Meta Ads live");

  const recherche = [
    t("Beobachtung") && `Beobachtung: ${t("Beobachtung")}`,
    t("Spezialisierung") && `Spezialisierung: ${t("Spezialisierung")}`,
    team && `Team: ${team.length > 90 ? `${team.slice(0, 88)}…` : team}`,
    t("CRM") && `CRM laut Recherche: ${t("CRM")}`,
    t("Score") && `Score: ${t("Score")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const icp = mapIcp(t("ICP"));
  const enrichStatus = t("enrich_status");
  const excluded = exclusionReason(icp, enrichStatus, notionStatus);
  const is24 = normalizeUrl(t("IS24 URL"));
  const stadt = t("Stadt");
  const firma =
    cleanFirma(t("Firma")) ??
    firmaFromIs24(is24) ??
    (person.name ? `${person.name}${stadt ? ` (${stadt})` : ""}` : null);

  const notiz = [
    `Notion-Sync (ImmoScout Makler Leads) ${today.split("-").reverse().join(".")}`,
    `Call-Status in Notion: ${notionStatus || "—"}${fu ? ` · FU: ${fu}` : ""} · ICP: ${icp}`,
    excluded && `Nicht erneut kontaktieren: ${excluded}`,
    ansprechpartner && ansprechpartner !== person.name && `Ansprechpartner (Notion): ${ansprechpartner}`,
    recherche && `\n${recherche}`,
    body.trim() && `\n${body.trim()}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);

  return {
    pageId: rec.pageId,
    lastEdited: rec.lastEdited,
    firma,
    stadt,
    telefon: t("Telefon (enrich)"),
    website: normalizeUrl(t("Website")),
    instagram: normalizeUrl(t("Instagram URL")),
    is24,
    person,
    icp,
    enrichStatus,
    notionStatus,
    status: excluded ? "disqualified" : mapStatus(notionStatus),
    excluded,
    wv: parseNotionDate(t("Nächster Anruf")),
    crm: mapCrm(t("CRM")),
    inserate: inserateRaw && Number.isFinite(Number(inserateRaw)) ? Math.round(Number(inserateRaw)) : null,
    meta: metaRaw === "ja" ? true : metaRaw === "nein" ? false : null,
    notiz,
  };
}

// ---------------------------------------------------------------------------
// Abgleich
// ---------------------------------------------------------------------------

const NEEDS_WV: SyncStatus[] = ["kein_anschluss_1", "kein_anschluss_2", "kein_anschluss_3", "callback", "set_appointment"];
/** Weiter fortgeschritten: ein Ausschluss aus Notion überschreibt das nicht automatisch. */
const ADVANCED = new Set(["set_appointment", "closed", "kunde"]);
/** Noch kein Gespräch: hier darf eine ICP-raus-Einschätzung den Lead ausschließen. */
const UNTOUCHED = new Set(["neu", "kontaktiert"]);

/**
 * Plan berechnen. `lastSync` (ISO) steuert, ob bestehende Leads eine neue
 * Notiz bekommen: nur Seiten, die danach in Notion bearbeitet wurden.
 */
export function planSync(
  leads: NotionLead[],
  companies: ExistingCompany[],
  opts: { lastSync: string; today: string },
): SyncPlan {
  const byNotion = new Map<string, ExistingCompany>();
  const byIs24 = new Map<string, ExistingCompany>();
  const byDomain = new Map<string, ExistingCompany>();
  const byPhone = new Map<string, ExistingCompany>();
  const byPerson = new Map<string, ExistingCompany[]>();
  const byNameStadt = new Map<string, ExistingCompany>();
  const byNameOnly = new Map<string, ExistingCompany>();
  const ambiguousDomain = new Set<string>();
  for (const c of companies) {
    if (c.notion_id) byNotion.set(c.notion_id.replace(/-/g, ""), c);
    const k = is24Key(c.quell_url);
    if (k) byIs24.set(k, c);
    const domains = new Set(
      [domainKey(c.website), ...(c.people ?? []).map((p) => domainKey(p.email))].filter((d): d is string => !!d),
    );
    for (const d of domains) {
      if (byDomain.has(d) && byDomain.get(d) !== c) ambiguousDomain.add(d);
      byDomain.set(d, c);
    }
    for (const ph of [c.telefon, ...(c.people ?? []).map((p) => p.telefon)]) {
      const pk = phoneKey(ph);
      if (pk) byPhone.set(pk, c);
    }
    for (const p of c.people ?? []) {
      const nk = nameKey(p.name);
      if (nk.includes(" ")) byPerson.set(nk, [...(byPerson.get(nk) ?? []), c]);
    }
    byNameStadt.set(`${nameKey(c.name)}|${nameKey(c.stadt)}`, c);
    if (!c.stadt) byNameOnly.set(nameKey(c.name), c);
  }

  /** Ansprechpartner-Treffer nur, wenn eindeutig und die Stadt nicht widerspricht. */
  function personMatch(lead: NotionLead): ExistingCompany | undefined {
    const nk = nameKey(lead.person.name);
    if (!nk.includes(" ")) return undefined;
    const hits = (byPerson.get(nk) ?? []).filter(
      (c) => !c.stadt || !lead.stadt || nameKey(c.stadt) === nameKey(lead.stadt),
    );
    return hits.length === 1 ? hits[0] : undefined;
  }

  const plan: SyncPlan = { create: [], update: [], conflicts: [], skipped: [] };
  const seen = new Set<string>();
  let spread = 0;

  for (const lead of leads) {
    if (lead.enrichStatus === "duplikat") {
      plan.skipped.push({ firma: lead.firma, reason: "enrich" });
      continue;
    }
    if (!lead.firma) {
      plan.skipped.push({ firma: null, reason: "ohne_name" });
      continue;
    }
    const dedupeKey = is24Key(lead.is24) ?? `${nameKey(lead.firma)}|${nameKey(lead.stadt)}`;
    if (seen.has(dedupeKey)) {
      plan.skipped.push({ firma: lead.firma, reason: "doppelt_in_notion" });
      continue;
    }
    seen.add(dedupeKey);

    const k = is24Key(lead.is24);
    const dom = domainKey(lead.website) ?? domainKey(lead.person.email);
    const ph = phoneKey(lead.telefon);
    const candidates: [MatchedBy, ExistingCompany | undefined][] = [
      ["notion", byNotion.get(lead.pageId.replace(/-/g, ""))],
      ["is24", k ? byIs24.get(k) : undefined],
      ["domain", dom && !ambiguousDomain.has(dom) ? byDomain.get(dom) : undefined],
      ["telefon", ph ? byPhone.get(ph) : undefined],
      ["person", personMatch(lead)],
      ["name_stadt", byNameStadt.get(`${nameKey(lead.firma)}|${nameKey(lead.stadt)}`)],
      ["name", byNameOnly.get(nameKey(lead.firma))],
    ];
    const found = candidates.find(([, c]) => c);
    const match = found?.[1];
    const matchedBy: MatchedBy = found?.[0] ?? "name";

    const sourceKey = `notion:${lead.pageId}:${hash(lead.notiz.replace(/^.*\n/, ""))}`;

    if (!match) {
      const wv = lead.excluded
        ? null
        : (lead.wv ??
          (lead.status === "later"
            ? addCalendarWeeksSkipWeekend(opts.today, 13)
            : NEEDS_WV.includes(lead.status)
              ? addBusinessDays(opts.today, 2 + (spread++ % 5))
              : null));
      plan.create.push({ lead, wv, sourceKey });
      continue;
    }

    const patch: CompanyPatch = {};
    if (!match.telefon && lead.telefon) patch.telefon = lead.telefon;
    if (!match.website && lead.website) patch.website = lead.website;
    if (!match.stadt && lead.stadt) patch.stadt = lead.stadt;
    if (!match.instagram_url && lead.instagram) patch.instagram_url = lead.instagram;
    if (!match.quell_url && lead.is24) patch.quell_url = lead.is24;
    if (!match.crm_system && lead.crm) patch.crm_system = lead.crm;
    if (match.inserate_aktiv === null && lead.inserate !== null) patch.inserate_aktiv = lead.inserate;
    if (match.meta_ads === null && lead.meta !== null) patch.meta_ads = lead.meta;
    // Notion-ID nur setzen, wenn die Firma noch keine hat (eindeutiger Index).
    const linkNotion = !match.notion_id;
    if (linkNotion) patch.notion_id = lead.pageId;
    if ((match.icp ?? "offen") === "offen" && lead.icp !== "offen") patch.icp = lead.icp;

    const editedSince = lead.lastEdited > opts.lastSync;
    let setStatus: SyncPlan["update"][number]["setStatus"] = null;
    if (lead.excluded) {
      // „Kein Interesse“ ist ein Nein der Firma → schließt alles bis auf Termin/Closing/Kunde aus.
      // ICP raus / Vorfilter ist nur eine alte Einschätzung → nur, solange niemand mit ihr im Gespräch ist.
      const saidNo = EXCLUDING_STATUS.has(lead.notionStatus.trim().toLowerCase());
      const protectedStatus = saidNo
        ? ADVANCED.has(match.pipeline_status)
        : !UNTOUCHED.has(match.pipeline_status);
      if (match.pipeline_status !== "disqualified") {
        if (protectedStatus) {
          plan.conflicts.push({
            firma: match.name,
            companyId: match.id,
            crm: match.pipeline_status,
            notion: `${lead.notionStatus || "—"} (${lead.excluded})`,
          });
        } else {
          setStatus = { status: "disqualified", wv: null };
        }
      }
    } else if (match.pipeline_status === "neu" && lead.status !== "neu") {
      setStatus = { status: lead.status, wv: lead.wv };
    } else if (editedSince && lead.status !== "neu" && match.pipeline_status !== lead.status) {
      plan.conflicts.push({
        firma: match.name,
        companyId: match.id,
        crm: match.pipeline_status,
        notion: lead.notionStatus,
      });
    }

    // Erstes Verknüpfen bringt die Recherche als Notiz mit; danach nur bei Änderungen in Notion.
    const note = editedSince || linkNotion || setStatus ? { text: lead.notiz, sourceKey } : null;
    if (Object.keys(patch).length || note || setStatus) {
      plan.update.push({ lead, companyId: match.id, companyName: match.name, matchedBy, patch, note, setStatus });
    }
  }
  return plan;
}

/** Notion-Blöcke (erste Ebene) als schlichter Text für die Notiz. */
export function blocksToText(
  blocks: { type: string; [key: string]: unknown }[],
): string {
  const lines: string[] = [];
  for (const b of blocks) {
    const data = b[b.type] as { rich_text?: RichText } | undefined;
    const text = richText(data?.rich_text);
    if (!text) continue;
    if (b.type.startsWith("heading")) lines.push(`\n${text}`);
    else if (b.type === "bulleted_list_item" || b.type === "numbered_list_item") lines.push(`• ${text}`);
    else lines.push(text);
  }
  return lines.join("\n").trim();
}
