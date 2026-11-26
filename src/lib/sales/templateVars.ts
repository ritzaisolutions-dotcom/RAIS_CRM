/**
 * Platzhalter für E-Mail-Vorlagen.
 *
 * Syntax: `{{variable}}` oder mit Fallback `{{variable|Ersatztext}}`.
 * Vorlagen ohne Platzhalter bleiben unverändert.
 */

export const TEMPLATE_VARIABLES = [
  { key: "vorname", label: "Vorname", example: "Anna" },
  { key: "nachname", label: "Nachname", example: "Becker" },
  { key: "name", label: "Ganzer Name", example: "Anna Becker" },
  { key: "firma", label: "Firma", example: "Becker Immobilien GmbH" },
  { key: "stadt", label: "Stadt", example: "Leipzig" },
  { key: "website", label: "Website", example: "becker-immobilien.de" },
  { key: "absender", label: "Absender", example: "Kevin Ritz" },
  {
    key: "terminvorschlaege",
    label: "Terminvorschläge",
    example: "• Donnerstag 27.11. 10:00 Uhr – https://crm…/termin/…",
  },
  { key: "termin", label: "Termin (Einladung)", example: "Donnerstag, 03. Dezember um 10:00 Uhr" },
  { key: "meetlink", label: "Google-Meet-Link", example: "https://meet.google.com/abc-defg-hij" },
] as const;

export type TemplateVarKey = (typeof TEMPLATE_VARIABLES)[number]["key"];
export type TemplateContext = Partial<Record<TemplateVarKey, string | null>>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z_]+)\s*(?:\|([^}]*))?\}\}/g;

/** Baut den Kontext aus Personen- und Firmendaten. */
export function buildTemplateContext(input: {
  personName?: string | null;
  firma?: string | null;
  stadt?: string | null;
  website?: string | null;
  absender?: string | null;
}): TemplateContext {
  const full = input.personName?.trim() || "";
  const parts = full.split(/\s+/).filter(Boolean);
  // Titel wie "Dr." oder "Herr"/"Frau" nicht als Vorname verwenden.
  const cleaned = parts.filter((p) => !/^(herr|frau|dr\.?|prof\.?)$/i.test(p));
  return {
    name: full || null,
    vorname: cleaned.length > 1 ? cleaned[0] : null,
    nachname: cleaned.length > 0 ? cleaned[cleaned.length - 1] : null,
    firma: input.firma?.trim() || null,
    stadt: input.stadt?.trim() || null,
    website: input.website
      ? input.website.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "")
      : null,
    absender: input.absender?.trim() || null,
  };
}

export type RenderResult = {
  text: string;
  /** Platzhalter ohne Wert und ohne Fallback — Senden sollte blockiert sein. */
  missing: string[];
  /** Platzhalter, die es gar nicht gibt (Tippfehler). */
  unknown: string[];
};

const KNOWN = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));

export function renderTemplate(text: string, ctx: TemplateContext): RenderResult {
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const out = text.replace(PLACEHOLDER, (match, rawKey: string, fallback?: string) => {
    const key = rawKey.toLowerCase();
    if (!KNOWN.has(key)) {
      unknown.add(rawKey);
      return match;
    }
    const value = ctx[key as TemplateVarKey];
    if (value && value.trim()) return value;
    if (fallback !== undefined) return fallback.trim();
    missing.add(key);
    return match;
  });
  return { text: out, missing: [...missing], unknown: [...unknown] };
}

/** Findet alle Platzhalter in einem Text (für Hinweise im Editor). */
export function listPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) found.add(m[1].toLowerCase());
  return [...found];
}
