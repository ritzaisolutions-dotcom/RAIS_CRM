import Link from "next/link";
import { Info } from "lucide-react";
import { EfferdShell } from "@/components/EfferdShell";
import { StatsTrendChart } from "@/components/stats/StatsTrendChart";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/panel";
import { countDueLeads } from "@/lib/sales/leadQueries";
import {
  KANAL_LABELS,
  SMALL_SAMPLE,
  STATS_RANGES,
  formatPct,
  normalizeLeadStats,
  parseStatsRange,
  pct,
  statsRangeBounds,
  touchesPerTermin,
  type StatsBreakdownRow,
  type StatsTotals,
} from "@/lib/sales/stats";
import { ICP_LABELS, LEAD_QUELLE_LABELS, type Icp, type LeadQuelle } from "@/lib/sales/types";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statistik" };

function formatNum(v: number | null, digits = 0) {
  return v === null ? "—" : v.toLocaleString("de-DE", { maximumFractionDigits: digits });
}

function formatDay(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

/** Veränderung gegenüber dem Vorzeitraum; `better` = höher ist besser. */
function Delta({ now, before, better = "up" }: { now: number | null; before: number | null; better?: "up" | "down" }) {
  if (now === null || before === null) return <span className="text-fg-subtle">—</span>;
  const diff = now - before;
  if (Math.abs(diff) < 0.05) return <span className="text-fg-subtle">±0</span>;
  const good = better === "up" ? diff > 0 : diff < 0;
  const sign = diff > 0 ? "+" : "−";
  return (
    <span className={good ? "text-[var(--tone-green-fg)]" : "text-[var(--tone-red-fg)]"}>
      {sign}
      {formatNum(Math.abs(diff), Number.isInteger(diff) ? 0 : 1)}
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Panel className="px-4 py-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", accent ? "text-accent" : "text-fg")}>{value}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
        {delta ? <span className="tabular-nums">{delta}</span> : null}
        {hint ? <span className="truncate">{hint}</span> : null}
      </p>
    </Panel>
  );
}

function FunnelTable({
  rows,
  label,
  labelFor,
  showTouches,
}: {
  rows: StatsBreakdownRow[];
  label: string;
  labelFor: (key: string) => string;
  showTouches?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-center text-[13px] text-fg-muted">Keine Kontakte im Zeitraum.</p>;
  }
  const th = "h-8 px-3 text-right text-[11.5px] font-medium text-fg-muted";
  const td = "px-3 py-2 text-right tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line bg-surface-2">
            <th className={cn(th, "text-left")}>{label}</th>
            <th className={th}>Leads kontaktiert</th>
            <th className={th}>Erreicht</th>
            <th className={th}>Gespräch</th>
            <th className={th}>Termin</th>
            <th className={th}>Lead → Termin</th>
            {showTouches ? <th className={th}>Touches / Termin</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const small = r.kontaktiert > 0 && r.kontaktiert < SMALL_SAMPLE;
            return (
              <tr key={r.key} className="border-b border-line last:border-0">
                <td className="px-3 py-2 text-left font-medium text-fg">{labelFor(r.key)}</td>
                <td className={td}>{r.kontaktiert}</td>
                <td className={td}>
                  {r.erreicht}
                  <span className="ml-1.5 text-xs text-fg-subtle">{formatPct(pct(r.erreicht, r.kontaktiert))}</span>
                </td>
                <td className={td}>{r.gespraeche}</td>
                <td className={cn(td, r.termine > 0 && "font-semibold text-accent")}>{r.termine}</td>
                <td className={td} title={small ? `Weniger als ${SMALL_SAMPLE} Leads — nur grober Hinweis` : undefined}>
                  <span className={small ? "text-fg-subtle" : undefined}>
                    {formatPct(pct(r.termine, r.kontaktiert))}
                    {small ? "*" : ""}
                  </span>
                </td>
                {showTouches ? (
                  <td className={td}>{formatNum(r.termine > 0 && r.touches ? r.touches / r.termine : null, 1)}</td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function StatistikPage({
  searchParams,
}: {
  searchParams: Promise<{ zeitraum?: string }>;
}) {
  const params = await searchParams;
  const rangeKey = parseStatsRange(params.zeitraum);
  const bounds = statsRangeBounds(rangeKey);

  const supabase = await createClient();
  const [{ data, error }, dueBadge] = await Promise.all([
    supabase.rpc("lead_stats", { p_from: bounds.from, p_to: bounds.to, p_grain: bounds.grain }),
    countDueLeads(),
  ]);
  if (error) throw error;
  const s = normalizeLeadStats(data, bounds);
  const cur: StatsTotals = s.current;
  const prev: StatsTotals = s.prior;

  const kontaktrate = pct(cur.erreicht, cur.kontaktiert);
  const terminquote = pct(cur.termine, cur.gespraeche);
  const tpt = touchesPerTermin(cur);
  const rangeLabel = STATS_RANGES.find((r) => r.key === rangeKey)?.label ?? "";
  const lastDay = (() => {
    const d = new Date(`${s.to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <EfferdShell bare todoBadge={dueBadge}>
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="Statistik"
          description={`${rangeLabel} · ${formatDay(s.from)} – ${formatDay(lastDay)} · Vergleich mit dem Zeitraum davor`}
          actions={
            <div className="flex rounded-md border border-line bg-surface-2 p-0.5">
              {STATS_RANGES.map((r) => (
                <Link
                  key={r.key}
                  href={r.key === "4w" ? "/statistik" : `/statistik?zeitraum=${r.key}`}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs transition-colors",
                    r.key === rangeKey ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {r.label}
                </Link>
              ))}
            </div>
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-6xl gap-4 p-5 [&>*]:min-w-0">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi
                label="Termine gebucht"
                value={formatNum(cur.termine)}
                delta={<Delta now={cur.termine} before={prev.termine} />}
                hint="vs. davor"
                accent
              />
              <Kpi
                label="Kontakt-Touches"
                value={formatNum(cur.touches)}
                delta={<Delta now={cur.touches} before={prev.touches} />}
                hint="vs. davor"
              />
              <Kpi
                label="Leads kontaktiert"
                value={formatNum(cur.kontaktiert)}
                delta={<Delta now={cur.kontaktiert} before={prev.kontaktiert} />}
                hint="vs. davor"
              />
              <Kpi
                label="Kontaktrate"
                value={formatPct(kontaktrate)}
                hint={`${cur.erreicht} von ${cur.kontaktiert} Leads erreicht`}
              />
              <Kpi
                label="Terminquote"
                value={formatPct(terminquote)}
                hint={`${cur.termine} Termine aus ${cur.gespraeche} Gesprächen`}
              />
              <Kpi
                label="Touches pro Termin"
                value={formatNum(tpt, 1)}
                delta={<Delta now={tpt} before={touchesPerTermin(prev)} better="down" />}
                hint="weniger = effizienter"
              />
            </div>

            <Panel>
              <PanelHeader
                title={`Kontakte und Termine pro ${s.grain === "week" ? "Woche" : "Monat"}`}
                description="Balken: Kontakt-Touches je Kanal (linke Achse) · Linie: gebuchte Termine (rechte Achse)"
              />
              <div className="px-2 py-3">
                <StatsTrendChart data={s.trend} grain={s.grain} />
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                title="Funnel je Kanal"
                description="Pro Lead gezählt. Ein Termin zählt für den Kanal, über den er gebucht wurde, sonst für den letzten Kontakt davor."
              />
              <FunnelTable rows={s.kanaele} label="Kanal" labelFor={(k) => KANAL_LABELS[k] ?? k} showTouches />
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
              <Panel>
                <PanelHeader title="Je Quelle" description="Welche Lead-Liste bringt Termine?" />
                <FunnelTable
                  rows={s.quellen}
                  label="Quelle"
                  labelFor={(k) => (k === "ohne" ? "Ohne Quelle" : (LEAD_QUELLE_LABELS[k as LeadQuelle] ?? k))}
                />
              </Panel>
              <Panel>
                <PanelHeader title="Je ICP-Bewertung" description="Zahlt sich das ICP-Scoring aus?" />
                <FunnelTable rows={s.icp} label="ICP" labelFor={(k) => ICP_LABELS[k as Icp] ?? k} />
              </Panel>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi
                label="Median bis zum Termin"
                value={s.median_tage_bis_termin === null ? "—" : `${formatNum(s.median_tage_bis_termin, 1)} Tage`}
                hint="vom ersten Kontakt bis zum Termin"
              />
              <Kpi
                label="Termine über mehrere Kanäle"
                value={formatNum(s.termine_mehrkanal)}
                hint={cur.termine ? `von ${cur.termine} Terminen` : undefined}
              />
              <Kpi
                label="Termine ohne Kontakt-Touch"
                value={formatNum(s.termine_ohne_kanal)}
                hint="nur Status gesetzt, z. B. Import"
              />
            </div>

            <p className="flex items-start gap-2 text-xs text-fg-subtle">
              <Info className="mt-px size-3.5 shrink-0" />
              <span>
                Kontakt-Touch = Anruf, E-Mail, LinkedIn-Nachricht, SMS oder Meeting; Notizen und reine Status-Wechsel
                zählen nicht. Raten sind pro Lead gerechnet. * = weniger als {SMALL_SAMPLE} Leads, nur grober Hinweis.
                Zeiträume nach deutscher Zeit.
              </span>
            </p>
          </div>
        </div>
      </div>
    </EfferdShell>
  );
}
