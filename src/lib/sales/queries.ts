import { createClient } from "@/lib/supabase/server";
import type {
  Abbruchgrund,
  AkquiseKpis,
  AnalyticsDashboardData,
  AnalyticsRange,
  CallListeRow,
  Company,
  Opportunity,
  Person,
  PipelineStatus,
  PipelineStatusCount,
  TouchErgebnis,
  TouchKanal,
  Touchpoint,
} from "@/lib/sales/types";
import { rangeBounds } from "@/lib/sales/types";

export async function fetchCallListe(): Promise<CallListeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_call_liste")
    .select("*")
    .order("firma");
  if (error) throw error;
  return (data ?? []) as CallListeRow[];
}

export async function fetchKundenListe(): Promise<CallListeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_kunden_liste")
    .select("*")
    .order("firma");
  if (error) throw error;
  return (data ?? []) as CallListeRow[];
}

export async function fetchCompany(id: string): Promise<Company | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id,name,stadt,website,instagram_url,facebook_url,telefon,mitarbeiterzahl,crm_system,anfragen_pro_woche,inserate_aktiv,relationship,pipeline_status,created_at,updated_at",
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

export async function fetchTouchpoints(
  companyId: string,
): Promise<Touchpoint[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("touchpoints")
    .select("*")
    .eq("company_id", companyId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Touchpoint[];
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
  const [
    { count: prospects },
    { count: kunden },
    { count: ausgeschlossen },
    { data: recentTouches },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("relationship", "Prospect"),
    supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("relationship", "Kunde"),
    supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("relationship", "Ausgeschlossen"),
    supabase
      .from("touchpoints")
      .select("id, ergebnis, occurred_at, company_id")
      .order("occurred_at", { ascending: false })
      .limit(6),
  ]);

  const dueSoon = await supabase
    .from("v_call_liste")
    .select("company_id, naechster_touch")
    .not("naechster_touch", "is", null);

  const today = new Date().toISOString().slice(0, 10);
  const dueCount = (dueSoon.data ?? []).filter(
    (r) => r.naechster_touch && r.naechster_touch <= today,
  ).length;

  const activity = (recentTouches ?? []).map((t) => ({
    title: String(t.ergebnis),
    when: new Date(t.occurred_at).toLocaleString("de-DE"),
  }));

  return {
    kpis: [
      {
        label: "Prospects",
        value: String(prospects ?? 0),
        hint: "in Call-Liste",
      },
      {
        label: "Kunden",
        value: String(kunden ?? 0),
        hint: "aktive Accounts",
      },
      {
        label: "Fällig heute",
        value: String(dueCount),
        hint: "naechster_touch ≤ heute",
      },
      {
        label: "Ausgeschlossen",
        value: String(ausgeschlossen ?? 0),
        hint: "nicht in Liste",
      },
    ],
    activity,
  };
}

export async function fetchAkquiseKpis(
  range: AnalyticsRange,
): Promise<AkquiseKpis> {
  const { from, to } = rangeBounds(range);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("akquise_kpis", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Partial<AkquiseKpis>;
  return {
    from: raw.from ?? from,
    to: raw.to ?? to,
    totals: {
      dials: Number(raw.totals?.dials ?? 0),
      dms: Number(raw.totals?.dms ?? 0),
      connects: Number(raw.totals?.connects ?? 0),
      conversations: Number(raw.totals?.conversations ?? 0),
      appointments: Number(raw.totals?.appointments ?? 0),
      total_touches: Number(raw.totals?.total_touches ?? 0),
      connect_rate_pct:
        raw.totals?.connect_rate_pct == null
          ? null
          : Number(raw.totals.connect_rate_pct),
      appointment_rate_pct:
        raw.totals?.appointment_rate_pct == null
          ? null
          : Number(raw.totals.appointment_rate_pct),
    },
    series: Array.isArray(raw.series) ? raw.series : [],
    status_mix: Array.isArray(raw.status_mix) ? raw.status_mix : [],
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

export async function fetchPipelineStatusCounts(): Promise<
  PipelineStatusCount[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pipeline_status_counts");
  if (error) throw error;
  const raw = (data ?? []) as { status?: string; n?: number }[];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r.status && typeof r.n === "number")
    .map((r) => ({
      status: r.status as PipelineStatus,
      n: Number(r.n),
    }));
}

export type LogTouchInput = {
  companyId: string;
  personId?: string | null;
  kanal: TouchKanal;
  ergebnis: TouchErgebnis;
  notiz?: string | null;
  naechster_touch?: string | null;
  abbruchgrund?: Abbruchgrund | null;
};
