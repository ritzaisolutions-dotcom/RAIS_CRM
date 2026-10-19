import { createClient } from "@/lib/supabase/server";
import type {
  AnalyticsDashboardData,
  AnalyticsRange,
  CallListeRow,
  Company,
  CustomFieldDef,
  CustomFieldValue,
  DialenQueue,
  EmailTemplate,
  LeadList,
  ListeDueFilter,
  ListeSort,
  Opportunity,
  Person,
  PipelineStatus,
  SalesTask,
  SavedView,
  Sequence,
  SequenceEnrollment,
  SequenceStep,
  TouchErgebnis,
  Touchpoint,
  WorkflowRule,
} from "@/lib/sales/types";
import { ERGEBNIS_LABELS } from "@/lib/sales/types";
import { BUSINESS_TZ, businessToday, rangeBounds } from "@/lib/sales/dates";

const CALL_LISTE_COLUMNS =
  "company_id,firma,entscheider,bundesland,stadt,crm,\"anfragen/woche\",naechster_touch,status,tage_seit_touch,tel,email,linkedin_url,inserate_aktiv,mitarbeiterzahl,meta_ads,website,instagram_url,facebook_url,opp_stage";

/** Zeilen pro Seite. PostgREST liefert ohnehin max. 1000 (`config.toml`). */
export const LISTE_PAGE_SIZE = 100;

export type ListeViewName =
  | "v_call_liste"
  | "v_termine_liste"
  | "v_kunden_liste";

type ListeQueryView =
  | ListeViewName
  | "v_call_liste_by_list"
  | "v_termine_liste_by_list";

export type CallListeFilters = {
  status?: PipelineStatus | "";
  due?: ListeDueFilter;
  q?: string;
  sort?: ListeSort;
  page?: number;
  /** Membership list filter (Dialen / Termine). */
  listId?: string;
  /** Dialen work-queue chip. */
  queue?: DialenQueue;
};

export type ListeResult = {
  rows: CallListeRow[];
  total: number;
  page: number;
  pageSize: number;
};

function resolveListeQueryView(
  view: ListeViewName,
  listId: string | undefined,
): ListeQueryView {
  if (!listId) return view;
  if (view === "v_call_liste") return "v_call_liste_by_list";
  if (view === "v_termine_liste") return "v_termine_liste_by_list";
  // Kunden has no membership bar; ignore listId.
  return view;
}

async function fetchListe(
  view: ListeViewName,
  filters: CallListeFilters,
): Promise<ListeResult> {
  const supabase = await createClient();
  const page =
    Number.isFinite(filters.page) && (filters.page ?? 0) > 0
      ? Math.floor(filters.page as number)
      : 1;
  const offset = (page - 1) * LISTE_PAGE_SIZE;
  const listId = filters.listId?.trim() || undefined;
  const queryView = resolveListeQueryView(view, listId);

  // Membership views carry list_id; base views do not — branch so TS keeps columns tight.
  let query =
    queryView === "v_call_liste_by_list"
      ? supabase
          .from("v_call_liste_by_list")
          .select(CALL_LISTE_COLUMNS, { count: "exact" })
          .eq("list_id", listId as string)
      : queryView === "v_termine_liste_by_list"
        ? supabase
            .from("v_termine_liste_by_list")
            .select(CALL_LISTE_COLUMNS, { count: "exact" })
            .eq("list_id", listId as string)
        : supabase.from(view).select(CALL_LISTE_COLUMNS, { count: "exact" });

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

  const queue = filters.queue ?? "";
  if (queue === "today") {
    query = query
      .not("naechster_touch", "is", null)
      .lte("naechster_touch", today);
  } else if (queue === "wiedervorlage") {
    query = query.gt("naechster_touch", today);
  } else if (queue === "no_phone") {
    query = query.is("tel", null);
  } else if (queue === "call") {
    query = query.not("tel", "is", null);
  }

  const term = filters.q?.trim();
  if (term) {
    const safe = term.replace(/[%,()]/g, " ");
    query = query.or(
      `firma.ilike.%${safe}%,entscheider.ilike.%${safe}%,tel.ilike.%${safe}%,email.ilike.%${safe}%`,
    );
  }

  if (filters.sort === "firma") {
    query = query.order("firma");
  } else if (filters.sort === "faellig" || queue === "wiedervorlage") {
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

export function fetchTermineListe(
  filters: CallListeFilters = {},
): Promise<ListeResult> {
  return fetchListe("v_termine_liste", filters);
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
  view: ListeViewName,
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
      "id,name,stadt,bundesland,website,instagram_url,facebook_url,linkedin_url,telefon,mitarbeiterzahl,crm_system,anfragen_pro_woche,inserate_aktiv,meta_ads,relationship,recherche,pipeline_status,created_at,updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Company | null;
}

export async function fetchCustomValuesForCompanies(
  companyIds: string[],
): Promise<CustomFieldValue[]> {
  if (!companyIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_field_values")
    .select("company_id,field_id,value_text,value_number,value_json")
    .in("company_id", companyIds);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    company_id: row.company_id,
    field_id: row.field_id,
    value_text: row.value_text,
    value_number: row.value_number,
    value_json: Array.isArray(row.value_json)
      ? (row.value_json as string[])
      : null,
  }));
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

export async function fetchCompanyTasks(
  companyId: string,
): Promise<SalesTask[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("company_id", companyId)
    .order("due_on")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SalesTask[];
}

export type OpenTasksFilter =
  | "today"
  | "overdue"
  | "week"
  | "all";

export async function fetchOpenTasksDue(
  filter: OpenTasksFilter = "all",
  opts?: { art?: SalesTask["art"]; limit?: number },
): Promise<SalesTask[]> {
  const supabase = await createClient();
  const today = businessToday();
  const [y, m, d] = today.split("-").map(Number);
  const weekEnd = new Date(Date.UTC(y, m - 1, d + 7))
    .toISOString()
    .slice(0, 10);
  let query = supabase
    .from("v_open_tasks")
    .select("*")
    .order("due_on")
    .limit(opts?.limit ?? 500);
  if (filter === "today") query = query.eq("due_on", today);
  if (filter === "overdue") query = query.lt("due_on", today);
  if (filter === "week") {
    query = query.gte("due_on", today).lt("due_on", weekEnd);
  }
  if (opts?.art) query = query.eq("art", opts.art);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SalesTask[];
}

export async function countOpenTasksDueToday(): Promise<number> {
  const supabase = await createClient();
  const today = businessToday();
  const { count, error } = await supabase
    .from("v_open_tasks")
    .select("id", { count: "exact", head: true })
    .lte("due_on", today);
  if (error) throw error;
  return count ?? 0;
}

export async function fetchCustomFieldDefs(
  activeOnly = true,
): Promise<CustomFieldDef[]> {
  const supabase = await createClient();
  let query = supabase
    .from("custom_field_defs")
    .select("id,name,slug,field_type,options,active,sort_order,created_at")
    .order("sort_order")
    .order("name");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    options: Array.isArray(row.options)
      ? (row.options as string[])
      : [],
  }));
}

export async function fetchCompanyCustomValues(
  companyId: string,
): Promise<CustomFieldValue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_field_values")
    .select("company_id,field_id,value_text,value_number,value_json")
    .eq("company_id", companyId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    company_id: row.company_id,
    field_id: row.field_id,
    value_text: row.value_text,
    value_number: row.value_number,
    value_json: Array.isArray(row.value_json)
      ? (row.value_json as string[])
      : null,
  }));
}

export async function fetchEmailTemplates(): Promise<EmailTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("id,name,subject,body,created_at")
    .order("name");
  if (error) throw error;
  return (data ?? []) as EmailTemplate[];
}

export async function fetchSequences(): Promise<Sequence[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sequences")
    .select("id,name,active,created_at")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Sequence[];
}

export async function fetchSequenceSteps(
  sequenceId: string,
): Promise<SequenceStep[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("step_order");
  if (error) throw error;
  return (data ?? []) as SequenceStep[];
}

export async function fetchCompanyEnrollments(
  companyId: string,
): Promise<SequenceEnrollment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sequence_enrollments")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SequenceEnrollment[];
}

export async function fetchWorkflowRules(): Promise<WorkflowRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_rules")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as WorkflowRule[];
}

export async function fetchSavedViews(
  scope: "liste" | "kunden" = "liste",
): Promise<SavedView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_views")
    .select("*")
    .eq("scope", scope)
    .order("name");
  if (error) throw error;
  return (data ?? []) as SavedView[];
}

export type SavedViewWithCount = SavedView & { count: number };

export async function fetchSavedViewsWithCounts(
  scope: "liste" | "kunden" = "liste",
): Promise<SavedViewWithCount[]> {
  const views = await fetchSavedViews(scope);
  const viewName = scope === "kunden" ? "v_kunden_liste" : "v_call_liste";
  return Promise.all(
    views.map(async (v) => {
      const filters: CallListeFilters = {
        status: (v.filters.status as PipelineStatus | undefined) ?? "",
        due: (v.filters.due as ListeDueFilter | undefined) ?? "",
        q: v.filters.q ?? "",
        sort: (v.filters.sort as ListeSort | undefined) ?? "",
        page: 1,
      };
      const result = await fetchListe(viewName, filters);
      return { ...v, count: result.total };
    }),
  );
}

/** Full smart-view queue for the session dialer (capped). */
export const DIALER_MAX_ROWS = 500;

export async function fetchDialerQueue(
  filters: CallListeFilters = {},
): Promise<{ rows: CallListeRow[]; truncated: boolean }> {
  // Dialer only runs the Dialen lane (never Termine/Kunden).
  const { rows, truncated } = await fetchListeForExport("v_call_liste", filters);
  return {
    rows: rows.slice(0, DIALER_MAX_ROWS),
    truncated: truncated || rows.length > DIALER_MAX_ROWS,
  };
}

export async function fetchLeadLists(): Promise<LeadList[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_lists")
    .select("id,name,sort_order,created_at")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  const lists = (data ?? []) as LeadList[];
  if (!lists.length) return lists;

  const { data: members } = await supabase
    .from("lead_list_members")
    .select("list_id");
  const counts = new Map<string, number>();
  for (const m of members ?? []) {
    counts.set(m.list_id, (counts.get(m.list_id) ?? 0) + 1);
  }
  return lists.map((l) => ({ ...l, member_count: counts.get(l.id) ?? 0 }));
}

export async function fetchCompanyListIds(
  companyId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_list_members")
    .select("list_id")
    .eq("company_id", companyId);
  if (error) throw error;
  return (data ?? []).map((r) => r.list_id);
}

export type QuarantineRow = {
  id: string;
  provider_ref: string;
  from_email: string | null;
  subject: string | null;
  body: string | null;
  received_at: string;
};

export async function fetchInboundQuarantine(): Promise<QuarantineRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbound_email_quarantine")
    .select("id,provider_ref,from_email,subject,body,received_at")
    .is("resolved_at", null)
    .order("received_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as QuarantineRow[];
}

export type GlobalSearchHit = {
  kind: "firma" | "person" | "touch";
  id: string;
  companyId: string;
  title: string;
  subtitle: string;
};

export async function searchGlobal(
  term: string,
): Promise<GlobalSearchHit[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const safe = q.replace(/[%,()]/g, " ").slice(0, 80);
  const supabase = await createClient();
  const hits: GlobalSearchHit[] = [];

  const [companies, people, touches] = await Promise.all([
    supabase
      .from("companies")
      .select("id,name,stadt,telefon")
      .ilike("name", `%${safe}%`)
      .limit(8),
    supabase
      .from("people")
      .select("id,company_id,name,email,telefon")
      .or(`name.ilike.%${safe}%,email.ilike.%${safe}%`)
      .limit(8),
    supabase
      .from("touchpoints")
      .select("id,company_id,notiz,kanal")
      .ilike("notiz", `%${safe}%`)
      .is("voided_at", null)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  for (const c of companies.data ?? []) {
    hits.push({
      kind: "firma",
      id: c.id,
      companyId: c.id,
      title: c.name,
      subtitle: [c.stadt, c.telefon].filter(Boolean).join(" · ") || "Firma",
    });
  }
  for (const p of people.data ?? []) {
    hits.push({
      kind: "person",
      id: p.id,
      companyId: p.company_id,
      title: p.name,
      subtitle: p.email ?? p.telefon ?? "Kontakt",
    });
  }
  for (const t of touches.data ?? []) {
    hits.push({
      kind: "touch",
      id: String(t.id),
      companyId: t.company_id,
      title: (t.notiz ?? "").slice(0, 80) || t.kanal,
      subtitle: `Touch · ${t.kanal}`,
    });
  }
  return hits;
}
