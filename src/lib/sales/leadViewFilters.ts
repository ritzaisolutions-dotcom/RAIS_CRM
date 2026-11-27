/**
 * Filter je Ansicht der Leads-Liste — eine Definition für beide Seiten:
 * `applyView()` (PostgREST, Liste) und `sales.lead_view_counts()` (SQL, Zähler).
 * Der Test `leadViewFilters.test.ts` prüft, dass die Migration genau diese
 * Bedingungen enthält. Keine Server-Imports hier.
 */
import { NICHT_ERREICHT, type LeadViewKey } from "./leads";

/** Platzhalter für „heute“ (Berlin) — im Client `businessToday()`, in SQL `sales.business_today()`. */
export const TODAY = Symbol("today");

export type LeadViewCond =
  | { op: "eq" | "neq"; col: string; val: string }
  | { op: "in"; col: string; val: readonly string[] }
  | { op: "lte"; col: string; val: typeof TODAY }
  | { op: "notNull"; col: string }
  /**
   * Noch nicht bewertete bzw. Grenzfall-Leads aus Notion gehören in „ICP prüfen“,
   * nicht in die Arbeitslisten. Leads ohne Notion-Herkunft (LinkedIn, manuell) bleiben drin.
   */
  | { op: "inWork" };

const prospect = (status: string): LeadViewCond[] => [
  { op: "eq", col: "relationship", val: "Prospect" },
  { op: "eq", col: "status", val: status },
];

export const LEAD_VIEW_FILTERS: Record<LeadViewKey, readonly LeadViewCond[]> = {
  alle: [{ op: "neq", col: "relationship", val: "Ausgeschlossen" }, { op: "inWork" }],
  faellig: [
    { op: "neq", col: "relationship", val: "Ausgeschlossen" },
    { op: "notNull", col: "naechster_touch" },
    { op: "lte", col: "naechster_touch", val: TODAY },
  ],
  neu: [...prospect("neu"), { op: "inWork" }],
  kontaktiert: prospect("kontaktiert"),
  nicht_erreicht: [
    { op: "eq", col: "relationship", val: "Prospect" },
    { op: "in", col: "status", val: NICHT_ERREICHT },
  ],
  rueckruf: prospect("callback"),
  spaeter: prospect("later"),
  termin: prospect("set_appointment"),
  closing: prospect("closed"),
  kunden: [{ op: "eq", col: "relationship", val: "Kunde" }],
  icp_pruefen: [
    { op: "eq", col: "relationship", val: "Prospect" },
    { op: "notNull", col: "notion_id" },
    { op: "in", col: "icp", val: ["Grenzfall", "offen"] },
  ],
  kein_interesse: [
    { op: "eq", col: "relationship", val: "Ausgeschlossen" },
    { op: "neq", col: "icp", val: "RAUS" },
  ],
  icp_raus: [
    { op: "eq", col: "relationship", val: "Ausgeschlossen" },
    { op: "eq", col: "icp", val: "RAUS" },
  ],
};

/**
 * Minimal-Schnittstelle des Supabase-Query-Builders, die wir brauchen.
 * Generisch, damit Liste (`v_leads`) und Listen-Ansicht (`v_leads_by_list`) passen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filterable = { eq: any; neq: any; in: any; lte: any; not: any; or: any };

export function applyLeadViewFilter<Q extends Filterable>(
  query: Q,
  view: LeadViewKey,
  today: string,
): Q {
  let q = query;
  for (const c of LEAD_VIEW_FILTERS[view] ?? LEAD_VIEW_FILTERS.alle) {
    switch (c.op) {
      case "eq":
        q = q.eq(c.col, c.val);
        break;
      case "neq":
        q = q.neq(c.col, c.val);
        break;
      case "in":
        q = q.in(c.col, c.val as string[]);
        break;
      case "lte":
        q = q.lte(c.col, today);
        break;
      case "notNull":
        q = q.not(c.col, "is", null);
        break;
      case "inWork":
        q = q.or("notion_id.is.null,icp.eq.JA");
        break;
    }
  }
  return q;
}

/** SQL-Bedingung (Alias `l` = `sales.v_leads`) — so steht sie in `sales.lead_view_counts()`. */
export function leadViewFilterSql(view: LeadViewKey): string {
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
  return LEAD_VIEW_FILTERS[view]
    .map((c) => {
      switch (c.op) {
        case "eq":
          return `l.${c.col} = ${lit(c.val)}`;
        case "neq":
          return `l.${c.col} <> ${lit(c.val)}`;
        case "in":
          return `l.${c.col} in (${c.val.map(lit).join(",")})`;
        case "lte":
          return `l.${c.col} <= sales.business_today()`;
        case "notNull":
          return `l.${c.col} is not null`;
        case "inWork":
          return `(l.notion_id is null or l.icp = 'JA')`;
      }
    })
    .join(" and ");
}
