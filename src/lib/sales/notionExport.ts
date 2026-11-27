/**
 * Notion-Export (ZIP mit CSV + einer .md-Datei pro Seite) → SourceRecords.
 * Läuft im Browser; die Dateien werden vorher entpackt übergeben.
 */

import { hash, type SourceRecord } from "./notionSync";

export type ExportFile = { name: string; text: string };

export type ParsedExport = {
  csvName: string;
  totalRows: number;
  /** Alle Zeilen des Exports (ICP wird im Abgleich ausgewertet). */
  records: SourceRecord[];
};

export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

/** Seiteninhalt einer exportierten Seite: alles nach dem Eigenschaften-Block. */
export function pageFromMarkdown(name: string, text: string): { id: string | null; title: string; body: string } {
  const id = name.match(/([0-9a-f]{32})\.md$/i)?.[1] ?? null;
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const titleIdx = lines.findIndex((l) => l.startsWith("# "));
  const title = titleIdx >= 0 ? lines[titleIdx].slice(2).trim() : "";
  let i = titleIdx + 1;
  while (i < lines.length && (lines[i].trim() === "" || /^[^#\n]{1,40}: /.test(lines[i]))) i++;
  return { id, title, body: lines.slice(i).join("\n").trim() };
}

function toIso(s: string | undefined): string {
  if (!s) return "1970-01-01T00:00:00.000Z";
  const d = new Date(s.replace(/\s+(AM|PM)$/i, " $1"));
  return Number.isNaN(d.getTime()) ? "1970-01-01T00:00:00.000Z" : d.toISOString();
}

export function parseNotionExport(files: ExportFile[]): ParsedExport {
  const csvs = files.filter((f) => f.name.toLowerCase().endsWith(".csv"));
  // „…_all.csv“ enthält alle Zeilen; die andere CSV nur die gerade aktive Ansicht.
  const csv = csvs.find((f) => /_all\.csv$/i.test(f.name)) ?? csvs[0];
  if (!csv) throw new Error("Keine CSV im Export gefunden. Bitte in Notion als „Markdown & CSV“ exportieren.");

  const pages = new Map<string, { id: string | null; body: string }>();
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith(".md")) continue;
    const p = pageFromMarkdown(f.name, f.text);
    if (p.title && !pages.has(p.title)) pages.set(p.title, { id: p.id, body: p.body });
  }

  const rows = parseCsv(csv.text);
  if (rows.length && !("Firma" in rows[0])) {
    throw new Error("Unerwartetes Format: Spalte „Firma“ fehlt. Ist das die Datenbank „ImmoScout Makler Leads“?");
  }

  const records: SourceRecord[] = [];
  for (const r of rows) {
    // Alle Zeilen: auch Grenzfall/RAUS/„Kein Interesse“, damit sie nie erneut gezogen werden.
    const page = pages.get(r["Firma"] ?? "");
    records.push({
      pageId: page?.id ?? `export-${hash(`${r["Firma"]}|${r["IS24 URL"] ?? ""}|${r["Stadt"] ?? ""}`)}`,
      lastEdited: toIso(r["Last edited time"]),
      fields: r,
      body: page?.body ?? "",
    });
  }
  return { csvName: csv.name.split("/").pop() ?? csv.name, totalRows: rows.length, records };
}
