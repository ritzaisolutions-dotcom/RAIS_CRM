import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { businessToday } from "@/lib/sales/dates";
import {
  LEAD_VIEWS,
  LEADS_PAGE_SIZE,
  parseLeadPageSize,
  type LeadSortKey,
  type LeadViewKey,
} from "@/lib/sales/leads";
import { applyLeadViewFilter as applyView } from "@/lib/sales/leadViewFilters";
import type { LeadQuelle, LeadRow } from "@/lib/sales/types";

export { LEADS_PAGE_SIZE };

const LEAD_COLUMNS =
  "company_id,firma,person_id,entscheider,stadt,crm,\"anfragen/woche\",naechster_touch,status,relationship,tage_seit_touch,letzter_touch_am,letzter_kanal,tel,firma_telefon,email,person_linkedin_url,linkedin_company_url,linkedin_url,inserate_aktiv,mitarbeiterzahl,meta_ads,website,instagram_url,facebook_url,xing_url,youtube_url,tiktok_url,quelle,quell_url,created_at,kontaktversuche,kategorie,letzter_kontakt_kanal,letzter_kontakt_am,vorheriger_kontakt_kanal,opp_stage,icp,notion_id";

export type LeadFilters = {
  view: LeadViewKey;
  q?: string;
  quelle?: LeadQuelle | "";
  /** Kategorie-Filter: Lead, Kontakt (Netzwerk) oder Kunde. */
  kategorie?: "lead" | "kontakt" | "kunde" | "";
  sort?: LeadSortKey;
  page?: number;
  /** 50 / 100 / 200 — alles andere fällt auf LEADS_PAGE_SIZE zurück. */
  pageSize?: number;
  listId?: string;
};

export type LeadsResult = {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function fetchLeads(filters: LeadFilters): Promise<LeadsResult> {
  const supabase = await createClient();
  const page =
    Number.isFinite(filters.page) && (filters.page ?? 0) > 0
      ? Math.floor(filters.page as number)
      : 1;
  const pageSize = parseLeadPageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;
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
  if (filters.kategorie === "kunde") query = query.eq("relationship", "Kunde");
  else if (filters.kategorie === "lead") query = query.eq("kategorie", "lead").neq("relationship", "Kunde");
  else if (filters.kategorie === "kontakt") query = query.eq("kategorie", "kontakt");

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
    offset + pageSize - 1,
  );
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as LeadRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Zähler je Ansicht in einer Abfrage (`sales.lead_view_counts()`), pro Request
 * einmal (React `cache`) — Navigation-Badge und Ansichten teilen sich das Ergebnis.
 * Fällt auf Einzel-Abfragen zurück, solange die Migration noch nicht eingespielt ist.
 */
const loadLeadViewCounts = cache(async (): Promise<Record<LeadViewKey, number>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_view_counts");
  if (!error && data && typeof data === "object") {
    const raw = data as Partial<Record<LeadViewKey, number>>;
    return Object.fromEntries(
      LEAD_VIEWS.map((v) => [v.key, Number(raw[v.key] ?? 0)]),
    ) as Record<LeadViewKey, number>;
  }
  // PGRST202 = Funktion unbekannt (Migration fehlt) → alter Weg.
  if (error && error.code !== "PGRST202") throw error;
  const today = businessToday();
  const entries = await Promise.all(
    LEAD_VIEWS.map(async (v) => {
      const { count, error: e } = await applyView(
        supabase.from("v_leads").select("company_id", { count: "exact", head: true }),
        v.key,
        today,
      );
      if (e) throw e;
      return [v.key, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<LeadViewKey, number>;
});

export async function fetchLeadViewCounts(): Promise<Record<LeadViewKey, number>> {
  return loadLeadViewCounts();
}

/** Fällige Wiedervorlagen (heute + überfällig) für das Badge in der Navigation. */
export async function countDueLeads(): Promise<number> {
  try {
    return (await loadLeadViewCounts()).faellig;
  } catch {
    return 0;
  }
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
