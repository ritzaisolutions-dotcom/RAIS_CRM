/**
 * CSV → Lead-Zeilen für den Import-Assistenten.
 * Reine Funktionen (Client + Tests), keine Server-Imports.
 */
import { parseCsvLine } from "./csvImport";

export const IMPORT_FIELDS = [
  { key: "name", label: "Firma", required: true },
  { key: "stadt", label: "Stadt" },
  { key: "person_name", label: "Ansprechpartner" },
  { key: "rolle", label: "Rolle" },
  { key: "email", label: "E-Mail" },
  { key: "person_telefon", label: "Telefon (Person)" },
  { key: "telefon", label: "Telefon (Zentrale)" },
  { key: "website", label: "Website" },
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "instagram_url", label: "Instagram" },
  { key: "facebook_url", label: "Facebook" },
  { key: "quelle", label: "Quelle" },
  { key: "notiz", label: "Notiz" },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type ImportMapping = Record<number, ImportFieldKey | "">;
export type CleanLeadRow = Partial<Record<ImportFieldKey, string>> & { name: string };

/** Normalisierte Kopfzeile → Feld. Deckt DE/EN und die Notion-Exporte ab. */
const ALIASES: Record<string, ImportFieldKey> = {
  name: "name",
  firma: "name",
  firmenname: "name",
  company: "name",
  unternehmen: "name",
  stadt: "stadt",
  city: "stadt",
  ort: "stadt",
  ansprechpartner: "person_name",
  person: "person_name",
  personname: "person_name",
  kontakt: "person_name",
  kontaktperson: "person_name",
  entscheider: "person_name",
  gf: "person_name",
  geschaeftsfuehrer: "person_name",
  vorname_nachname: "person_name",
  fullname: "person_name",
  rolle: "rolle",
  position: "rolle",
  role: "rolle",
  title: "rolle",
  email: "email",
  e_mail: "email",
  mail: "email",
  emailadresse: "email",
  telefon: "telefon",
  tel: "telefon",
  phone: "telefon",
  telefonnummer: "telefon",
  festnetz: "telefon",
  mobil: "person_telefon",
  handy: "person_telefon",
  mobile: "person_telefon",
  telefon_person: "person_telefon",
  website: "website",
  webseite: "website",
  url: "website",
  homepage: "website",
  linkedin: "linkedin_url",
  linkedin_url: "linkedin_url",
  linkedinprofil: "linkedin_url",
  instagram: "instagram_url",
  facebook: "facebook_url",
  quelle: "quelle",
  source: "quelle",
  leadquelle: "quelle",
  notiz: "notiz",
  notizen: "notiz",
  note: "notiz",
  notes: "notiz",
  kommentar: "notiz",
  call_notizen: "notiz",
};

function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/^"|"$/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function detectDelimiter(line: string): string {
  const counts = { ",": 0, ";": 0, "\t": 0 } as Record<string, number>;
  let q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (!q && c in counts) counts[c] += 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ",";
}

/** Zerlegt CSV in Zeilen — Zeilenumbrüche in Anführungszeichen bleiben erhalten. */
function splitRecords(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      q = !q;
      cur += c;
    } else if ((c === "\n" || c === "\r") && !q) {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      if (cur.trim()) out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export type ParsedTable = { headers: string[]; rows: string[][]; delimiter: string };

export function parseCsvTable(raw: string): ParsedTable | { error: string } {
  const text = raw.replace(/^﻿/, "");
  const records = splitRecords(text);
  if (records.length < 2) return { error: "Mindestens Kopfzeile und eine Datenzeile nötig." };
  const delimiter = detectDelimiter(records[0]);
  const headers = parseCsvLine(records[0], delimiter).map((h) => h.replace(/^"|"$/g, "").trim());
  const rows = records
    .slice(1)
    .map((r) => parseCsvLine(r, delimiter))
    .filter((cols) => cols.some((c) => c.trim()));
  return { headers, rows, delimiter };
}

/** Vorschlag: jede Spalte auf ein Feld, jedes Feld höchstens einmal. */
export function suggestMapping(headers: string[]): ImportMapping {
  const used = new Set<ImportFieldKey>();
  const mapping: ImportMapping = {};
  headers.forEach((h, i) => {
    const key = ALIASES[normHeader(h)];
    if (key && !used.has(key)) {
      mapping[i] = key;
      used.add(key);
    } else {
      mapping[i] = "";
    }
  });
  return mapping;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function cleanUrl(v: string): string {
  const t = v.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
}

function cleanPhone(v: string): string {
  return v.replace(/[^\d+()/ -]/g, "").replace(/\s+/g, " ").trim();
}

export type RowIssue = "missing_name" | "invalid_email" | "duplicate_in_file";

export type PreparedRow = {
  index: number;
  row: CleanLeadRow;
  issues: RowIssue[];
};

/**
 * Mapping anwenden und bereinigen: E-Mail klein + geprüft, Telefon entrümpelt,
 * Links mit https://, Dubletten innerhalb der Datei (gleiche E-Mail oder
 * Firma + Stadt) markiert.
 */
export function prepareRows(table: ParsedTable, mapping: ImportMapping): PreparedRow[] {
  const seen = new Set<string>();
  return table.rows.map((cols, index) => {
    const row: CleanLeadRow = { name: "" };
    for (const [colStr, key] of Object.entries(mapping)) {
      if (!key) continue;
      let v = (cols[Number(colStr)] ?? "").trim().replace(/^'|'$/g, "");
      if (!v) continue;
      if (key === "email") {
        // Notion/Excel liefern teils mehrere Adressen — die erste zählt.
        v = v.split(/[;,\s]+/)[0].toLowerCase();
      } else if (key === "telefon" || key === "person_telefon") {
        v = cleanPhone(v);
      } else if (
        key === "website" ||
        key === "linkedin_url" ||
        key === "instagram_url" ||
        key === "facebook_url"
      ) {
        v = cleanUrl(v.split(/[\s;]+/)[0]);
      }
      if (v) row[key] = v;
    }
    row.name = row.name ?? "";

    const issues: RowIssue[] = [];
    if (!row.name.trim()) issues.push("missing_name");
    if (row.email && !EMAIL_RE.test(row.email)) issues.push("invalid_email");
    const keys = [
      row.email ? `e:${row.email}` : null,
      row.name ? `n:${row.name.toLowerCase()}|${(row.stadt ?? "").toLowerCase()}` : null,
    ].filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) issues.push("duplicate_in_file");
    keys.forEach((k) => seen.add(k));
    return { index, row, issues };
  });
}

export const ISSUE_LABELS: Record<RowIssue, string> = {
  missing_name: "Firma fehlt",
  invalid_email: "E-Mail ungültig",
  duplicate_in_file: "Doppelt in Datei",
};
