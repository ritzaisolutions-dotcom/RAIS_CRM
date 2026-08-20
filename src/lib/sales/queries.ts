import { createClient } from "@/lib/supabase/server";
import type {
  AnalyticsDashboardData,
  AnalyticsRange,
  CallListeRow,
  Company,
  ListeDueFilter,
  ListeSort,
  Opportunity,
  Person,
  PipelineStatus,
  TouchErgebnis,
  Touchpoint,
} from "@/lib/sales/types";
import { ERGEBNIS_LABELS } from "@/lib/sales/types";
import { BUSINESS_TZ, businessToday, rangeBounds } from "@/lib/sales/dates";

const CALL_LISTE_COLUMNS =
  "company_id,firma,entscheider,bundesland,crm,\"anfragen/woche\",naechster_touch,status,tage_seit_touch,tel,email,linkedin_url,inserate_aktiv,website,instagram_url,facebook_url";

/** Zeilen pro Seite. PostgREST liefert ohnehin max. 1000 (`config.toml`). */
export const LISTE_PAGE_SIZE = 100;

export type CallListeFilters = {
  status?: PipelineStatus | "";
  due?: ListeDueFilter;
  q?: string;
  sort?: ListeSort;
  page?: number;
};

export type ListeResult = {
  rows: CallListeRow[];
  total: number;
  page: number;
  pageSize: number;
};

async function fetchListe(
  view: "v_call_liste" | "v_kunden_liste",
  filters: CallListeFilters,
): Promise<ListeResult> {
  const supabase = await createClient();
  const page =
    Number.isFinite(filters.page) && (filters.page ?? 0) > 0
      ? Math.floor(filters.page as number)
      : 1;
  const offset = (page - 1) * LISTE_PAGE_SIZE;

  let query = supabase.from(view).select(CALL_LISTE_COLUMNS, {
    count: "exact",
  });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const today = businessToday();
  if (filters.due === "today") {
    query = query.eq("naechster_touch", today);
  } else if (filters.due === "overdue") {
    query = query
      .lt("naechster_touch", today)
      .not("naechster_touch", "is", null);
  }

  const term = filters.q?.trim();
  if (term) {
    const safe = term.replace(/[%,()]/g, " ");
    query = query.or(
      `firma.ilike.%${safe}%,entscheider.ilike.%${safe}%,tel.ilike.%${safe}%,email.ilike.%${safe}%`,
    );
  }

  // Ohne explizite Auswahl bleibt die ORDER BY der View erhalten: überfällig
  // zuerst, dann nächster Touch, dann Anfragen/Woche. Das ist die
  // Anruf-Priorität — vorher hat die App sie mit `.order("firma")`
  // überschrieben und damit alphabetisch statt nach Dringlichkeit sortiert.
  if (filters.sort === "firma") {
    query = query.order("firma");
  } else if (filters.sort === "faellig") {
    query = query.order("naechster_touch", { nullsFirst: false });
  } else if (filters.sort === "tage") {
    query = query.order("tage_seit_touch", {
      ascending: false,
      nullsFirst: false,
    });
  }

  const { data, error, count } = await query.range(
    offset,
    offset + LISTE_PAGE_SIZE - 1,
  );
  if (error) throw error;
  return {
    rows: (data ?? []) as CallListeRow[],
    total: count ?? 0,
    page,
    pageSize: LISTE_PAGE_SIZE,
  };
}

export function fetchCallListe(
  filters: CallListeFilters = {},
): Promise<ListeResult> {
  return fetchListe("v_call_liste", filters);
}

/** Obergrenze für den Export — schützt vor einem versehentlichen Vollabzug. */
export const EXPORT_MAX_ROWS = 10_000;

/**
 * Alle Zeilen einer Liste für den CSV-Export.
 *
 * Seitenweise, weil PostgREST bei 1000 Zeilen abschneidet (`config.toml`).
 * Genau diese stille Kappung war der Grund, warum die Liste oberhalb von 1000
 * Prospects unvollständig war, ohne dass es jemand gemerkt hätte.
 */
export async function fetchListeForExport(
  view: "v_call_liste" | "v_kunden_liste",
  filters: CallListeFilters = {},
): Promise<{ rows: CallListeRow[]; truncated: boolean }> {
  const rows: CallListeRow[] = [];
  let page = 1;

  for (;;) {
    const batch = await fetchListe(view, { ...filters, page });
    rows.push(...batch.rows);
    const done =
      batch.rows.length < LISTE_PAGE_SIZE || rows.length >= batch.total;
    if (done || rows.length >= EXPORT_MAX_ROWS) {
      return {
        rows: rows.slice(0, EXPORT_MAX_ROWS),
        truncated: rows.length > EXPORT_MAX_ROWS || batch.total > EXPORT_MAX_ROWS,
      };
    }
    page += 1;
  }
}

export function fetchKundenListe(
  filters: CallListeFilters = {},
): Promise<ListeResult> {
  return fetchListe("v_kunden_liste", filters);
}

export async function fetchCompany(id: string): Promise<Company | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id,name,stadt,website,instagram_url,facebook_url,telefon,mitarbeiterzahl,crm_system,anfragen_pro_woche,inserate_aktiv,relationship,recherche,pipeline_status,created_at,updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Company | null;
}

export async function fetchPeople(companyId: string): Promise<Person[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("company_id", companyId)
    .order("ist_entscheider", { ascending: false })
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Person[];
}

/** Wie viele Touchpoints die Detailseite lädt. */
export const TOUCHPOINT_PAGE_SIZE = 50;

export async function fetchTouchpoints(
  companyId: string,
  limit = TOUCHPOINT_PAGE_SIZE,
): Promise<{ rows: Touchpoint[]; total: number }> {
  const supabase = await createClient();
  // Begrenzt: vorher wurde die vollständige Historie einer lange bearbeiteten
  // Firma bei *jedem* Seitenaufruf und nach *jedem* Speichern komplett in die
  // RSC-Antwort serialisiert.
  const { data, error, count } = await supabase
    .from("touchpoints")
    .select("*", { count: "exact" })
    .eq("company_id", companyId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { rows: (data ?? []) as Touchpoint[], total: count ?? 0 };
}

export async function fetchOpportunities(
  companyId: string,
): Promise<Opportunity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Opportunity[];
}

export async function fetchWorkspaceStats() {
  const supabase = await createClient();
  const today = businessToday();
  const [
    prospectsRes,
    kundenRes,
    ausgeschlossenRes,
    dueRes,
    recentRes,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("relationship", "Prospect"),
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("relationship", "Kunde"),
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("relationship", "Ausgeschlossen"),
    supabase
      .from("v_call_liste")
      .select("company_id", { count: "exact", head: true })
      .not("naechster_touch", "is", null)
      .lte("naechster_touch", today),
    supabase
      .from("touchpoints")
      .select("id, ergebnis, occurred_at, company_id")
      .order("occurred_at", { ascending: false })
      .limit(6),
  ]);

  // Fehler dürfen hier nicht verschluckt werden. Vorher wurde nur `count`
  // destrukturiert; schlug eine Query fehl, war `count` null, `?? 0` machte
  // daraus eine 0 und der Header behauptete "Prospects 0 / Kunden 0", als wäre
  // das ein echter Messwert. Lieber ein ehrliches "—" als eine erfundene Zahl.
  const firstError =
    prospectsRes.error ??
    kundenRes.error ??
    ausgeschlossenRes.error ??
    dueRes.error ??
    recentRes.error;
  if (firstError) {
    console.error("[sales:workspace-stats]", {
      code: firstError.code,
      message: firstError.message,
    });
  }

  const kpiValue = (count: number | null, error: unknown) =>
    error ? "—" : String(count ?? 0);

  const activity = (recentRes.data ?? []).map((t) => {
    const ergebnis = t.ergebnis as TouchErgebnis;
    return {
      title: ERGEBNIS_LABELS[ergebnis] ?? String(t.ergebnis),
      when: new Date(t.occurred_at).toLocaleString("de-DE", {
        timeZone: BUSINESS_TZ,
      }),
    };
  });

  return {
    degraded: Boolean(firstError),
    kpis: [
      {
        label: "Prospects",
        value: kpiValue(prospectsRes.count, prospectsRes.error),
        hint: "in Call-Liste",
      },
      {
        label: "Kunden",
        value: kpiValue(kundenRes.count, kundenRes.error),
        hint: "aktive Accounts",
      },
      {
        label: "Fällig heute",
        value: kpiValue(dueRes.count, dueRes.error),
        hint: "naechster_touch ≤ heute",
      },
      {
        label: "Ausgeschlossen",
        value: kpiValue(ausgeschlossenRes.count, ausgeschlossenRes.error),
        hint: "nicht in Liste",
      },
    ],
    activity,
  };
}

function metric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalMetric(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchAnalyticsDashboard(
  range: AnalyticsRange,
): Promise<AnalyticsDashboardData> {
  const { from, to } = rangeBounds(range);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_dashboard", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;

  const raw = (data ?? {}) as unknown as Partial<AnalyticsDashboardData>;
  const summary = raw.summary;
  const prior = summary?.prior;
  const actions = raw.actions;
  const commercial = raw.commercial;
  const companyCounts = raw.company_counts;

  return {
    from: raw.from ?? from,
    to: raw.to ?? to,
    grain: raw.grain ?? "day",
    summary: {
      attempts: metric(summary?.attempts),
      dials: metric(summary?.dials),
      dms: metric(summary?.dms),
      connects: metric(summary?.connects),
      conversations: metric(summary?.conversations),
      appointments: metric(summary?.appointments),
      connect_rate_pct: optionalMetric(summary?.connect_rate_pct),
      appointment_rate_pct: optionalMetric(summary?.appointment_rate_pct),
      prior: {
        attempts: metric(prior?.attempts),
        connects: metric(prior?.connects),
        conversations: metric(prior?.conversations),
        appointments: metric(prior?.appointments),
        connect_rate_pct: optionalMetric(prior?.connect_rate_pct),
        appointment_rate_pct: optionalMetric(
          prior?.appointment_rate_pct,
        ),
      },
    },
    funnel: Array.isArray(raw.funnel)
      ? raw.funnel.map((step) => ({
          key: step.key,
          value: metric(step.value),
          conversion_pct: optionalMetric(step.conversion_pct),
        }))
      : [],
    channels: Array.isArray(raw.channels)
      ? raw.channels.map((channel) => ({
          channel: channel.channel,
          attempts: metric(channel.attempts),
          connects: metric(channel.connects),
          conversations: metric(channel.conversations),
          appointments: metric(channel.appointments),
          connect_rate_pct: optionalMetric(channel.connect_rate_pct),
          appointment_rate_pct: optionalMetric(
            channel.appointment_rate_pct,
          ),
        }))
      : [],
    trend: Array.isArray(raw.trend)
      ? raw.trend.map((point) => ({
          bucket: String(point.bucket),
          dials: metric(point.dials),
          dms: metric(point.dms),
          appointments: metric(point.appointments),
        }))
      : [],
    actions: {
      due_today: metric(actions?.due_today),
      overdue: metric(actions?.overdue),
      callbacks: metric(actions?.callbacks),
      contacted_today: metric(actions?.contacted_today),
    },
    pipeline: Array.isArray(raw.pipeline)
      ? raw.pipeline.map((item) => ({
          status: item.status,
          n: metric(item.n),
        }))
      : [],
    company_counts: {
      customers: metric(companyCounts?.customers),
      disqualified: metric(companyCounts?.disqualified),
    },
    commercial: {
      total_opportunities: metric(commercial?.total_opportunities),
      open_opportunities: metric(commercial?.open_opportunities),
      open_offers: metric(commercial?.open_offers),
      won: metric(commercial?.won),
      lost: metric(commercial?.lost),
      won_setup_revenue: metric(commercial?.won_setup_revenue),
      won_monthly_retainer: metric(commercial?.won_monthly_retainer),
      open_setup_value: metric(commercial?.open_setup_value),
      close_rate_pct: optionalMetric(commercial?.close_rate_pct),
    },
  };
}
