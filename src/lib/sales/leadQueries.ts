import { createClient } from "@/lib/supabase/server";
import { businessToday } from "@/lib/sales/dates";
import {
  LEAD_VIEWS,
  NICHT_ERREICHT,
  type LeadSortKey,
  type LeadViewKey,
} from "@/lib/sales/leads";
import type { LeadQuelle, LeadRow } from "@/lib/sales/types";

export const LEADS_PAGE_SIZE = 50;

const LEAD_COLUMNS =
  "company_id,firma,person_id,entscheider,stadt,crm,\"anfragen/woche\",naechster_touch,status,relationship,tage_seit_touch,letzter_touch_am,letzter_kanal,tel,firma_telefon,email,person_linkedin_url,linkedin_company_url,linkedin_url,inserate_aktiv,mitarbeiterzahl,meta_ads,website,instagram_url,facebook_url,xing_url,youtube_url,tiktok_url,quelle,quell_url,created_at,kontaktversuche,opp_stage";

export type LeadFilters = {
  view: LeadViewKey;
  q?: string;
  quelle?: LeadQuelle | "";
  sort?: LeadSortKey;
  page?: number;
  listId?: string;
};

export type LeadsResult = {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Wendet die Ansicht als Filter an. Generisch über den Query-Builder,
 * damit Liste und Zähler dieselbe Definition nutzen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyView<Q extends { eq: any; neq: any; in: any; lte: any; not: any }>(
  query: Q,
  view: LeadViewKey,
  today: string,
): Q {
  switch (view) {
    case "faellig":
      return query
        .neq("relationship", "Ausgeschlossen")
        .not("naechster_touch", "is", null)
        .lte("naechster_touch", today);
    case "neu":
      return query.eq("relationship", "Prospect").eq("status", "neu");
    case "nicht_erreicht":
      return query.eq("relationship", "Prospect").in("status", NICHT_ERREICHT);
    case "rueckruf":
      return query.eq("relationship", "Prospect").eq("status", "callback");
    case "termin":
      return query.eq("relationship", "Prospect").eq("status", "set_appointment");
    case "closing":
      return query.eq("relationship", "Prospect").eq("status", "closed");
    case "kunden":
      return query.eq("relationship", "Kunde");
    case "kein_interesse":
      return query.eq("relationship", "Ausgeschlossen");
    case "alle":
    default:
      return query.neq("relationship", "Ausgeschlossen");
  }
}

export async function fetchLeads(filters: LeadFilters): Promise<LeadsResult> {
  const supabase = await createClient();
  const page =
    Number.isFinite(filters.page) && (filters.page ?? 0) > 0
      ? Math.floor(filters.page as number)
      : 1;
  const offset = (page - 1) * LEADS_PAGE_SIZE;
  const today = businessToday();
  const listId = filters.listId?.trim() || undefined;

  let query = listId
    ? supabase
        .from("v_leads_by_list")
        .select(LEAD_COLUMNS, { count: "exact" })
        .eq("list_id", listId)
    : supabase.from("v_leads").select(LEAD_COLUMNS, { count: "exact" });

  query = applyView(query, filters.view, today);

  if (filters.quelle) query = query.eq("quelle", filters.quelle);

  const term = filters.q?.trim();
  if (term) {
    const safe = term.replace(/[%,()]/g, " ");
    query = query.or(
      `firma.ilike.%${safe}%,entscheider.ilike.%${safe}%,stadt.ilike.%${safe}%,email.ilike.%${safe}%,tel.ilike.%${safe}%`,
    );
  }

  switch (filters.sort) {
    case "firma":
      query = query.order("firma");
      break;
    case "neueste":
      query = query.order("created_at", { ascending: false });
      break;
    case "kontakt":
      query = query.order("letzter_touch_am", { ascending: true, nullsFirst: true });
      break;
    default:
      query = query
        .order("naechster_touch", { ascending: true, nullsFirst: false })
        .order("firma");
  }

  const { data, error, count } = await query.range(
    offset,
    offset + LEADS_PAGE_SIZE - 1,
  );
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as LeadRow[],
    total: count ?? 0,
    page,
    pageSize: LEADS_PAGE_SIZE,
  };
}

/** Zähler je Ansicht — Kopf-Abfragen ohne Zeilen, parallel. */
export async function fetchLeadViewCounts(): Promise<Record<LeadViewKey, number>> {
  const supabase = await createClient();
  const today = businessToday();
  const entries = await Promise.all(
    LEAD_VIEWS.map(async (v) => {
      const q = applyView(
        supabase.from("v_leads").select("company_id", { count: "exact", head: true }),
        v.key,
        today,
      );
      const { count, error } = await q;
      if (error) throw error;
      return [v.key, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<LeadViewKey, number>;
}

/** Fällige Wiedervorlagen (heute + überfällig) für das Badge in der Navigation. */
export async function countDueLeads(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await applyView(
    supabase.from("v_leads").select("company_id", { count: "exact", head: true }),
    "faellig",
    businessToday(),
  );
  if (error) return 0;
  return count ?? 0;
}

/**
 * Wiedervorlagen bis einschließlich `untilYmd` (Berlin), überfällige zuerst.
 * Ausgeschlossene Leads tauchen nicht auf.
 */
export async function fetchFollowUps(untilYmd: string): Promise<LeadRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_leads")
    .select(LEAD_COLUMNS)
    .neq("relationship", "Ausgeschlossen")
    .not("naechster_touch", "is", null)
    .lte("naechster_touch", untilYmd)
    .order("naechster_touch")
    .order("firma")
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as LeadRow[];
}
