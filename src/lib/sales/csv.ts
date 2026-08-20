/**
 * CSV-Erzeugung für den Listen-Export.
 *
 * Getrennt vom Route Handler, damit die Maskierung testbar ist — sie ist der
 * sicherheitsrelevante Teil.
 */

/**
 * Ein CSV-Feld maskieren.
 *
 * Führende `=`, `+`, `-`, `@`, Tab und CR werden mit einem Apostroph entwertet.
 * Excel und Google Sheets werten solche Zellen sonst als Formel aus
 * (CSV-Injection): ein Firmenname wie `=HYPERLINK("http://…")` oder
 * `=cmd|'/c calc'!A1` würde beim Öffnen der Exportdatei ausgeführt. Die Daten
 * stammen aus einem Feld, das jeder Nutzer frei befüllen kann.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return '""';
  const raw = String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * Zeilen zu einer CSV-Datei zusammensetzen.
 *
 * Semikolon als Trenner und ein vorangestelltes BOM, damit Excel in deutscher
 * Locale die Datei direkt korrekt in Spalten öffnet statt alles in eine einzige
 * Spalte zu legen.
 */
export function buildCsv<T>(
  rows: T[],
  columns: { header: string; get: (row: T) => string | number | null }[],
): string {
  const header = columns.map((c) => csvCell(c.header)).join(";");
  const body = rows
    .map((row) => columns.map((c) => csvCell(c.get(row))).join(";"))
    .join("\r\n");
  return `﻿${header}\r\n${body}${body ? "\r\n" : ""}`;
}
