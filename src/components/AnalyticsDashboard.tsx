"use client";

import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Clock3,
  MessageCircleReply,
  PhoneCall,
  Send,
  Target,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  AnalyticsChannel,
  AnalyticsDashboardData,
  AnalyticsFunnelKey,
  AnalyticsRange,
} from "@/lib/sales/types";
import {
  PIPELINE_STATUS_LABELS,
  pipelineTone,
} from "@/lib/sales/types";
import { cn } from "@/lib/utils";

const RANGES: { id: AnalyticsRange; label: string }[] = [
  { id: "day", label: "Tag" },
  { id: "week", label: "Woche" },
  { id: "month", label: "Monat" },
  { id: "year", label: "Jahr" },
];

const FUNNEL_LABELS: Record<AnalyticsFunnelKey, string> = {
  attempts: "Kontaktversuche",
  connects: "Erreicht",
  conversations: "Gespräche",
  appointments: "Termine",
};

const numberFormatter = new Intl.NumberFormat("de-DE");
const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function formatPercent(value: number | null) {
  return value == null ? "—" : `${numberFormatter.format(value)} %`;
}

function periodLabel(from: string, to: string) {
  const start = new Date(from);
  const exclusiveEnd = new Date(to);
  const end = new Date(exclusiveEnd.getTime() - 1);
  const format = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: start.getFullYear() === end.getFullYear() ? undefined : "numeric",
  });
  return `${format.format(start)} – ${format.format(end)}`;
}

function trendLabel(bucket: string, grain: AnalyticsDashboardData["grain"]) {
  const date = new Date(bucket);
  if (grain === "hour") {
    return new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  if (grain === "month") {
    return new Intl.DateTimeFormat("de-DE", { month: "short" }).format(date);
  }
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function Delta({
  value,
  prior,
  points = false,
}: {
  value: number | null;
  prior: number | null;
  points?: boolean;
}) {
  if (value == null || prior == null) {
    return <span className="text-rais-stone">Kein Vergleich</span>;
  }
  const difference = value - prior;
  if (difference === 0) {
    return <span className="text-rais-stone">Wie zuvor</span>;
  }
  const positive = difference > 0;
  const display = points
    ? `${positive ? "+" : ""}${numberFormatter.format(difference)} Pkt.`
    : prior === 0
      ? "Neu"
      : `${positive ? "+" : ""}${numberFormatter.format(
          (difference / prior) * 100,
        )} %`;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium",
        positive ? "text-rais-green" : "text-[#8b2e24]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {display}
    </span>
  );
}

function ResultCard({
  label,
  value,
  prior,
  hint,
  primary = false,
  points = false,
}: {
  label: string;
  value: number | null;
  prior: number | null;
  hint: string;
  primary?: boolean;
  points?: boolean;
}) {
  return (
    <div
      className={cn(
        "dense-panel px-4 py-4 shadow-sm",
        primary && "border-rais-orange bg-[#fff7f2]",
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-rais-stone">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 font-[family-name:var(--font-source-serif)] text-3xl font-semibold tabular-nums",
          primary && "text-rais-orange",
        )}
      >
        {points ? formatPercent(value) : numberFormatter.format(value ?? 0)}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <Delta value={value} prior={prior} points={points} />
        <span className="text-rais-stone">{hint}</span>
      </div>
    </div>
  );
}

function ActionCard({
  href,
  label,
  value,
  hint,
  icon: Icon,
  urgent = false,
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  icon: typeof Clock3;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group rounded-md border bg-white/55 p-3 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm",
        urgent && value > 0 ? "border-rais-orange" : "border-rais-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon
          className={cn(
            "h-4 w-4",
            urgent && value > 0 ? "text-rais-orange" : "text-rais-sage",
          )}
        />
        <ArrowRight className="h-3.5 w-3.5 text-rais-stone transition group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 font-[family-name:var(--font-source-serif)] text-2xl font-semibold tabular-nums">
        {numberFormatter.format(value)}
      </div>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-1 text-xs text-rais-stone">{hint}</div>
    </Link>
  );
}

function ChannelCard({ channel }: { channel: AnalyticsChannel }) {
  const isCall = channel.channel === "call";
  const Icon = isCall ? PhoneCall : Send;
  const lowSample = channel.attempts < 10;
  return (
    <div className="rounded-md border border-rais-border bg-white/55 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <span
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full",
              isCall
                ? "bg-[#fde8df] text-rais-orange"
                : "bg-[#e4efe3] text-rais-green",
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          {isCall ? "Telefon" : "LinkedIn DM"}
        </div>
        <span className="text-xs text-rais-stone">
          {channel.attempts} Kontakte
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="font-[family-name:var(--font-source-serif)] text-xl font-semibold tabular-nums">
            {channel.connects}
          </div>
          <div className="text-xs text-rais-stone">Erreicht</div>
        </div>
        <div>
          <div className="font-[family-name:var(--font-source-serif)] text-xl font-semibold tabular-nums">
            {channel.appointments}
          </div>
          <div className="text-xs text-rais-stone">Termine</div>
        </div>
        <div>
          <div className="font-[family-name:var(--font-source-serif)] text-xl font-semibold tabular-nums">
            {formatPercent(channel.connect_rate_pct)}
          </div>
          <div className="text-xs text-rais-stone">Connect</div>
        </div>
      </div>
      {lowSample ? (
        <p className="mt-3 text-xs text-rais-stone">
          Kleine Stichprobe – Quote noch nicht belastbar.
        </p>
      ) : null}
    </div>
  );
}

export function AnalyticsDashboard({
  range,
  data,
}: {
  range: AnalyticsRange;
  data: AnalyticsDashboardData;
}) {
  const summary = data.summary;
  const maxFunnel = Math.max(...data.funnel.map((step) => step.value), 1);
  const maxPipeline = Math.max(...data.pipeline.map((item) => item.n), 1);
  const trend = data.trend.map((point) => ({
    ...point,
    label: trendLabel(point.bucket, data.grain),
    kontakte: point.dials + point.dms,
  }));
  const channels: AnalyticsChannel[] = (["call", "dm"] as const).map(
    (channel) =>
      data.channels.find((item) => item.channel === channel) ?? {
        channel,
        attempts: 0,
        connects: 0,
        conversations: 0,
        appointments: 0,
        connect_rate_pct: null,
        appointment_rate_pct: null,
      },
  );
  const commercial = data.commercial;

  return (
    <div className="space-y-4">
      <header className="dense-panel flex flex-wrap items-end justify-between gap-4 p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rais-sage">
            Akquise auf einen Blick
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-source-serif)] text-2xl font-semibold">
            Was zählt. Was heute dran ist.
          </h1>
          <p className="mt-1 text-sm text-rais-stone">
            {periodLabel(data.from, data.to)} · Vergleich mit dem vorherigen
            Zeitraum
          </p>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Analysezeitraum">
          {RANGES.map((item) => (
            <Link
              key={item.id}
              href={`/analytics?range=${item.id}`}
              className={cn(
                "rounded-md border border-rais-border px-3 py-1.5 text-sm text-rais-stone transition hover:bg-white",
                range === item.id &&
                  "border-rais-orange bg-rais-orange text-white hover:bg-rais-orange-hover",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <section aria-labelledby="results-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="results-heading" className="text-sm font-semibold">
            Ergebnis
          </h2>
          <span className="text-xs text-rais-stone">gegen Vorzeitraum</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ResultCard
            label="Termine"
            value={summary.appointments}
            prior={summary.prior.appointments}
            hint="vereinbart"
            primary
          />
          <ResultCard
            label="Gespräche"
            value={summary.conversations}
            prior={summary.prior.conversations}
            hint="qualifiziert"
          />
          <ResultCard
            label="Terminquote"
            value={summary.appointment_rate_pct}
            prior={summary.prior.appointment_rate_pct}
            hint="Termine / Gespräche"
            points
          />
          <ResultCard
            label="Connect-Rate"
            value={summary.connect_rate_pct}
            prior={summary.prior.connect_rate_pct}
            hint="Erreicht / Versuche"
            points
          />
        </div>
      </section>

      <section className="dense-panel p-4 shadow-sm" aria-labelledby="today-heading">
        <div className="mb-3">
          <h2 id="today-heading" className="text-sm font-semibold">
            Heute handeln
          </h2>
          <p className="text-xs text-rais-stone">
            Direkter Einstieg in die nächste sinnvolle Aufgabe
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <ActionCard
            href="/liste?due=overdue"
            label="Überfällig"
            value={data.actions.overdue}
            hint="Touch nachholen"
            icon={Clock3}
            urgent
          />
          <ActionCard
            href="/liste?status=callback"
            label="Rückrufe"
            value={data.actions.callbacks}
            hint="Gespräch fortsetzen"
            icon={MessageCircleReply}
            urgent
          />
          <ActionCard
            href="/liste?due=today"
            label="Heute fällig"
            value={data.actions.due_today}
            hint="für heute geplant"
            icon={CalendarClock}
          />
          <ActionCard
            href="/liste"
            label="Heute kontaktiert"
            value={data.actions.contacted_today}
            hint="Firmen erreicht oder versucht"
            icon={Target}
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="dense-panel p-4 shadow-sm" aria-labelledby="funnel-heading">
          <div className="mb-4">
            <h2 id="funnel-heading" className="text-sm font-semibold">
              Akquise-Funnel
            </h2>
            <p className="text-xs text-rais-stone">
              Vom ersten Versuch bis zum Termin
            </p>
          </div>
          {data.funnel[0]?.value ? (
            <div className="space-y-3">
              {data.funnel.map((step, index) => {
                const width = Math.max(24, (step.value / maxFunnel) * 100);
                return (
                  <div key={step.key}>
                    <div className="mb-1.5 flex items-end justify-between gap-2">
                      <div>
                        <span className="text-sm font-medium">
                          {FUNNEL_LABELS[step.key]}
                        </span>
                        {index > 0 ? (
                          <span className="ml-2 text-xs text-rais-stone">
                            {formatPercent(step.conversion_pct)} der Vorstufe
                          </span>
                        ) : null}
                      </div>
                      <span className="font-[family-name:var(--font-source-serif)] text-xl font-semibold tabular-nums">
                        {step.value}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[#efece6]">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          step.key === "appointments"
                            ? "bg-rais-orange"
                            : "bg-rais-sage",
                        )}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState text="In diesem Zeitraum wurden noch keine Call- oder DM-Touches erfasst." />
          )}
        </section>

        <section className="dense-panel p-4 shadow-sm" aria-labelledby="channels-heading">
          <div className="mb-4">
            <h2 id="channels-heading" className="text-sm font-semibold">
              Welcher Kanal liefert?
            </h2>
            <p className="text-xs text-rais-stone">
              Telefon und LinkedIn DM direkt vergleichen
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {channels.map((channel) => (
              <ChannelCard key={channel.channel} channel={channel} />
            ))}
          </div>
        </section>
      </div>

      <section className="dense-panel p-4 shadow-sm" aria-labelledby="trend-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="trend-heading" className="text-sm font-semibold">
              Aktivität und Termine
            </h2>
            <p className="text-xs text-rais-stone">
              Kontaktvolumen im gewählten Zeitraum
            </p>
          </div>
          <div className="flex gap-4 text-xs text-rais-stone">
            <span>{summary.dials} Calls</span>
            <span>{summary.dms} DMs</span>
          </div>
        </div>
        {trend.length ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <CartesianGrid stroke="#D9D1C7" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#7B746B", fontSize: 11 }}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: "#7B746B", fontSize: 11 }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#FBF8F3",
                    border: "1px solid #D9D1C7",
                    borderRadius: 6,
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="kontakte"
                  name="Kontakte"
                  stroke="#789464"
                  fill="#789464"
                  fillOpacity={0.18}
                />
                <Area
                  type="monotone"
                  dataKey="appointments"
                  name="Termine"
                  stroke="#EC6A37"
                  fill="#EC6A37"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState text="Noch kein Verlauf für diesen Zeitraum." />
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="dense-panel p-4 shadow-sm" aria-labelledby="pipeline-heading">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id="pipeline-heading" className="text-sm font-semibold">
                Aktive Pipeline
              </h2>
              <p className="text-xs text-rais-stone">
                Aktueller Stand der Prospects
              </p>
            </div>
            <Link
              href="/liste"
              className="text-xs font-medium text-rais-orange hover:text-rais-orange-hover"
            >
              Liste öffnen →
            </Link>
          </div>
          {data.pipeline.length ? (
            <div className="space-y-2.5">
              {data.pipeline.map((item) => (
                <div key={item.status} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3">
                  <span
                    className="badge-tone w-fit"
                    data-tone={pipelineTone(item.status)}
                  >
                    {PIPELINE_STATUS_LABELS[item.status]}
                  </span>
                  <div className="h-2 overflow-hidden rounded-full bg-[#efece6]">
                    <div
                      className="h-full rounded-full bg-rais-sage"
                      style={{ width: `${(item.n / maxPipeline) * 100}%` }}
                    />
                  </div>
                  <span className="text-right text-sm font-semibold tabular-nums">
                    {item.n}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="Keine aktiven Prospects in der Pipeline." />
          )}
          <div className="mt-4 flex flex-wrap gap-3 border-t border-rais-border pt-3 text-xs text-rais-stone">
            <span>{data.company_counts.customers} Kunden gesamt</span>
            <span>{data.company_counts.disqualified} disqualifiziert</span>
          </div>
        </section>

        <section className="dense-panel p-4 shadow-sm" aria-labelledby="commercial-heading">
          <div className="flex items-center gap-2">
            <WalletCards className="h-4 w-4 text-rais-sage" />
            <h2 id="commercial-heading" className="text-sm font-semibold">
              Angebote & Umsatz
            </h2>
          </div>
          {commercial.total_opportunities === 0 ? (
            <div className="mt-5 rounded-md border border-dashed border-rais-border bg-white/45 p-5 text-center">
              <p className="font-medium">Noch keine Opportunities erfasst</p>
              <p className="mt-1 text-xs leading-relaxed text-rais-stone">
                Sobald Angebote auf einer Firma angelegt werden, erscheinen
                hier Pipeline-Wert, Umsatz und Abschlussquote.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <CommercialMetric
                label="Offene Angebote"
                value={String(commercial.open_offers)}
              />
              <CommercialMetric
                label="Pipeline-Wert"
                value={currencyFormatter.format(commercial.open_setup_value)}
              />
              <CommercialMetric
                label="Gewonnener Umsatz"
                value={currencyFormatter.format(commercial.won_setup_revenue)}
              />
              <CommercialMetric
                label="Abschlussquote"
                value={formatPercent(commercial.close_rate_pct)}
              />
              <div className="col-span-2 rounded-md bg-[#e4efe3] p-3 text-center">
                <div className="text-xs text-rais-green">
                  Gewonnener monatlicher Retainer
                </div>
                <div className="mt-1 font-[family-name:var(--font-source-serif)] text-xl font-semibold text-rais-green">
                  {currencyFormatter.format(commercial.won_monthly_retainer)}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid min-h-36 place-items-center rounded-md border border-dashed border-rais-border bg-white/35 p-5 text-center text-sm text-rais-stone">
      {text}
    </div>
  );
}

function CommercialMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-rais-border bg-white/55 p-3 text-center">
      <div className="font-[family-name:var(--font-source-serif)] text-xl font-semibold tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-xs text-rais-stone">{label}</div>
    </div>
  );
}
