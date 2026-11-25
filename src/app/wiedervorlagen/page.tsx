import Link from "next/link";
import { BellRing, CheckSquare, Phone } from "lucide-react";
import { EfferdShell } from "@/components/EfferdShell";
import { FollowUpPicker, StatusMenu } from "@/components/leads/LeadBits";
import { TaskDoneButton } from "@/components/followups/TaskDoneButton";
import { EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui/panel";
import { addCalendarWeeksSkipWeekend, businessToday } from "@/lib/sales/dates";
import { fetchFollowUps } from "@/lib/sales/leadQueries";
import { daysUntil, relativeDueLabel } from "@/lib/sales/leads";
import { fetchOpenTasksDue } from "@/lib/sales/queries";
import type { LeadRow } from "@/lib/sales/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wiedervorlagen" };

function LeadRows({ rows }: { rows: LeadRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const phone = r.tel || r.firma_telefon;
        return (
          <li
            key={r.company_id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 hover:bg-surface-2/60 md:grid-cols-[minmax(0,2fr)_10rem_9rem_minmax(0,1.5fr)_auto]"
          >
            <div className="min-w-0">
              <Link href={`/firma/${r.company_id}`} className="block truncate font-medium hover:underline">
                {r.firma}
              </Link>
              <div className="truncate text-xs text-fg-subtle">{r.stadt ?? "—"}</div>
            </div>
            <div className="hidden md:block">
              <StatusMenu companyId={r.company_id} status={r.status} />
            </div>
            <div className="hidden md:block">
              <FollowUpPicker companyId={r.company_id} date={r.naechster_touch} personId={r.person_id} />
            </div>
            <div className="hidden min-w-0 md:block">
              <div className="truncate text-[13px]">{r.entscheider ?? "—"}</div>
              {phone ? <div className="truncate text-xs text-fg-subtle">{phone}</div> : null}
            </div>
            <div className="flex justify-end gap-1">
              {phone ? (
                <a
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                  className="flex size-8 items-center justify-center rounded-md border border-line-strong text-fg-muted hover:bg-surface-2 hover:text-fg"
                  aria-label={`${r.firma} anrufen`}
                  title={`Anrufen: ${phone}`}
                >
                  <Phone className="size-3.5" />
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function WiedervorlagenPage() {
  const today = businessToday();
  const weekEnd = addCalendarWeeksSkipWeekend(today, 1);
  const [leads, tasks] = await Promise.all([
    fetchFollowUps(weekEnd),
    fetchOpenTasksDue("all", { limit: 200 }),
  ]);

  const overdue = leads.filter((r) => r.naechster_touch && daysUntil(r.naechster_touch, today) < 0);
  const dueToday = leads.filter((r) => r.naechster_touch === today);
  const thisWeek = leads.filter((r) => r.naechster_touch && daysUntil(r.naechster_touch, today) > 0);
  const openTasks = tasks.filter((t) => daysUntil(t.due_on, today) <= 7);
  const dueBadge = overdue.length + dueToday.length;

  const groups = [
    { key: "overdue", title: "Überfällig", rows: overdue, tone: "text-[var(--tone-red-fg)]" },
    { key: "today", title: "Heute", rows: dueToday, tone: "text-accent-fg" },
    { key: "week", title: "Nächste 7 Tage", rows: thisWeek, tone: "text-fg-muted" },
  ];

  return (
    <EfferdShell bare todoBadge={dueBadge}>
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="Wiedervorlagen"
          description={
            dueBadge > 0
              ? `${dueBadge} heute fällig oder überfällig`
              : "Heute nichts fällig"
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-5xl gap-4 p-5">
            {leads.length === 0 && openTasks.length === 0 ? (
              <Panel>
                <EmptyState
                  icon={<BellRing />}
                  title="Keine Wiedervorlagen in den nächsten 7 Tagen"
                  description="Setze bei einem Lead eine Wiedervorlage, dann taucht er hier auf."
                />
              </Panel>
            ) : null}

            {groups
              .filter((g) => g.rows.length > 0)
              .map((g) => (
                <Panel key={g.key} className="overflow-hidden">
                  <PanelHeader
                    title={
                      <span className="flex items-center gap-2">
                        <span className={g.tone}>{g.title}</span>
                        <span className="text-xs font-normal text-fg-subtle">{g.rows.length}</span>
                      </span>
                    }
                  />
                  <LeadRows rows={g.rows} />
                </Panel>
              ))}

            {openTasks.length > 0 ? (
              <Panel className="overflow-hidden">
                <PanelHeader
                  title={
                    <span className="flex items-center gap-2">
                      <CheckSquare className="size-3.5 text-fg-muted" />
                      Aufgaben
                      <span className="text-xs font-normal text-fg-subtle">{openTasks.length}</span>
                    </span>
                  }
                />
                <ul className="divide-y divide-line">
                  {openTasks.map((t) => {
                    const n = daysUntil(t.due_on, today);
                    return (
                      <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">{t.titel}</div>
                          <Link
                            href={`/firma/${t.company_id}`}
                            className="truncate text-xs text-fg-subtle hover:underline"
                          >
                            {t.firma ?? "Lead öffnen"}
                          </Link>
                        </div>
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            n < 0 ? "font-medium text-[var(--tone-red-fg)]" : n === 0 ? "font-medium text-accent-fg" : "text-fg-muted",
                          )}
                        >
                          {relativeDueLabel(t.due_on, today)}
                        </span>
                        <TaskDoneButton taskId={t.id} companyId={t.company_id} />
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            ) : null}
          </div>
        </div>
      </div>
    </EfferdShell>
  );
}
