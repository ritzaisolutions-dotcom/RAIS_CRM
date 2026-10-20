/** Minimal CSV line parser (quotes, escaped quotes, chosen delimiter). */
export function parseCsvLine(line: string, delimiter = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(headerLine: string): "," | ";" {
  // Prefer semicolon when it appears outside quotes more often (Excel DE export).
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i++) {
    const c = headerLine[i];
    if (c === '"') {
      if (inQuotes && headerLine[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (c === ",") commas += 1;
    if (c === ";") semis += 1;
  }
  return semis > commas ? ";" : ",";
}

export type ImportCompanyRow = {
  name: string;
  stadt: string | null;
  telefon: string | null;
  website: string | null;
  email: string | null;
  person_name: string | null;
};

const HEADER_ALIASES: Record<string, keyof ImportCompanyRow> = {
  name: "name",
  firma: "name",
  company: "name",
  stadt: "stadt",
  city: "stadt",
  ort: "stadt",
  telefon: "telefon",
  tel: "telefon",
  phone: "telefon",
  website: "website",
  url: "website",
  email: "email",
  "e-mail": "email",
  mail: "email",
  person_name: "person_name",
  person: "person_name",
  kontakt: "person_name",
  entscheider: "person_name",
};

/**
 * Parse a CSV string into import rows.
 * Expects a header row; unknown columns are ignored.
 * Accepts comma or semicolon (Excel DE) and DE/EN header aliases.
 */
export function parseCompanyImportCsv(raw: string): {
  rows: ImportCompanyRow[];
  error?: string;
} {
  const text = raw.replace(/^\ufeff/, "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { rows: [], error: "Header + mindestens eine Datenzeile nötig." };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((h) =>
    h.toLowerCase().replace(/^"|"$/g, "").trim(),
  );
  const mapped = headers.map((h) => HEADER_ALIASES[h] ?? null);
  if (!mapped.includes("name")) {
    return {
      rows: [],
      error: "Spalte „name“ / „Firma“ fehlt im Header.",
    };
  }

  const rows: ImportCompanyRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line, delimiter);
    const obj: ImportCompanyRow = {
      name: "",
      stadt: null,
      telefon: null,
      website: null,
      email: null,
      person_name: null,
    };
    mapped.forEach((key, i) => {
      if (!key) return;
      const val = (cols[i] ?? "").trim().replace(/^'|'$/g, "");
      if (!val) return;
      if (key === "name") obj.name = val;
      else obj[key] = val;
    });
    if (obj.name) rows.push(obj);
  }

  if (!rows.length) {
    return { rows: [], error: "Keine gültigen Firmenzeilen gefunden." };
  }
  return { rows };
}
