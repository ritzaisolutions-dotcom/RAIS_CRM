import Link from "next/link";
import {
  BellRing,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  TriangleAlert,
  Video,
} from "lucide-react";
import { EfferdShell } from "@/components/EfferdShell";
import { TaskDoneButton } from "@/components/followups/TaskDoneButton";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/panel";
import { BUSINESS_TZ, businessToday } from "@/lib/sales/dates";
import { fetchPlanEvents, type PlanEvent } from "@/lib/sales/inviteActions";
import { fetchFollowUps } from "@/lib/sales/leadQueries";
import { statusLabel } from "@/lib/sales/leads";
import { addDays, groupEventsByDay, isoWeek, resolveWeek, weekDays } from "@/lib/sales/plan";
import { fetchOpenTasksDue } from "@/lib/sales/queries";
import type { LeadRow, SalesTask } from "@/lib/sales/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan" };

const timeFmt = new Intl.DateTimeFormat("de-DE", { timeZone: BUSINESS_TZ, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });
const rangeFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

/** Titel, die auf ein echtes Gespräch hindeuten (auch ohne Google-Teilnehmer). */
const MEETING_TITLE =
  /\b(call|calls|meeting|termin|gespräch|erstgespräch|zoom|teams|meet|demo|sprechstunde|walkthrough|follow-?up|interview|onboarding|kickoff|kick-off)\b/i;

function ymdDate(ymd: string) {
  return new Date(`${ymd}T12:00:00Z`);
}

function eventTime(ev: PlanEvent, day: string): string {
  if (ev.allDay || !ev.start) return "Ganztägig";
  const start = timeFmt.format(new Date(ev.start));
  const end = ev.end ? timeFmt.format(new Date(ev.end)) : null;
  // Mehrtägige Termine: auf Folgetagen nur „bis …“ zeigen.
  if (ev.start.slice(0, 10) < day && end) return `bis ${end}`;
  return end ? `${start}–${end}` : start;
}

function EventCard({ ev, day, past }: { ev: PlanEvent; day: string; past: boolean }) {
  return (
    <li
      className={cn(
        "rounded-md border px-2.5 py-2 text-[13px]",
        ev.lead ? "border-accent/40 bg-accent/5" : "border-line bg-surface",
        (past || ev.free) && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] tabular-nums text-fg-subtle">{eventTime(ev, day)}</div>
          {ev.htmlLink ? (
            <a
              href={ev.htmlLink}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-2 font-medium leading-snug hover:underline"
              title="Im Google Kalender öffnen"
            >
              {ev.title}
            </a>
          ) : (
            <div className="line-clamp-2 font-medium leading-snug">{ev.title}</div>
          )}
        </div>
        {ev.meetLink && !past ? (
          <a
            href={ev.meetLink}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ size: "sm", variant: "default" }), "h-6 shrink-0 gap-1 px-2 text-[11px]")}
            aria-label={`Google Meet für „${ev.title}“ öffnen`}
          >
            <Video className="size-3" />
            Meet
          </a>
        ) : null}
      </div>
      {ev.lead ? (
        <Link
          href={`/firma/${ev.lead.companyId}`}
          className="mt-1 block truncate text-xs font-medium text-accent-fg hover:underline"
        >
          {ev.lead.firma} · {ev.lead.person}
        </Link>
      ) : null}
    </li>
  );
}

function FollowUpItem({ row, overdue }: { row: LeadRow; overdue?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1 text-[13px]">
      <Link href={`/firma/${row.company_id}`} className="min-w-0 truncate hover:underline">
        {row.firma}
      </Link>
      <span
        className={cn(
          "shrink-0 text-[11px]",
          overdue ? "font-medium text-[var(--tone-red-fg)]" : "text-fg-subtle",
        )}
      >
        {overdue ? "überfällig" : statusLabel(row.status)}
      </span>
    </li>
  );
}

function TaskItem({ task, overdue }: { task: SalesTask; overdue?: boolean }) {
  return (
    <li className="flex items-center gap-2 py-1 text-[13px]">
      <div className="min-w-0 flex-1">
        <div className={cn("truncate", overdue && "text-[var(--tone-red-fg)]")}>{task.titel}</div>
        <Link href={`/firma/${task.company_id}`} className="block truncate text-[11px] text-fg-subtle hover:underline">
          {task.firma ?? "Lead öffnen"}
        </Link>
      </div>
      <TaskDoneButton taskId={task.id} companyId={task.company_id} />
    </li>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-1 mt-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle [&_svg]:size-3">
      {icon}
      {children}
    </div>
  );
}

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; alle?: string }>;
}) {
  const { w, alle } = await searchParams;
  const showAll = alle === "1";
  const today = businessToday();
  const monday = resolveWeek(w);
  const days = weekDays(monday);
  const sunday = days[6];
  const isCurrentWeek = days.includes(today);

  const [calendar, followUps, tasks] = await Promise.all([
    fetchPlanEvents(monday, addDays(monday, 7)),
    fetchFollowUps(sunday),
    fetchOpenTasksDue("all", { limit: 500 }),
  ]);

  const allEvents = "events" in calendar ? calendar.events : [];
  // Standard: nur echte Termine (Teilnehmer, Meet oder Lead) – Zeitblöcke ausblenden.
  const isMeeting = (e: PlanEvent) =>
    Boolean(e.lead || e.meetLink || e.attendees.length > 0) || MEETING_TITLE.test(e.title);
  const events = showAll ? allEvents : allEvents.filter(isMeeting);
  const eventsByDay = groupEventsByDay(events, days);
  const hiddenByDay = showAll ? new Map<string, PlanEvent[]>() : groupEventsByDay(allEvents.filter((e) => !isMeeting(e)), days);
  const leadMeetings = events.filter((e) => e.lead).length;
  const weekQuery = (monday2: string, all = showAll) =>
    `/plan?w=${monday2}${all ? "&alle=1" : ""}`;

  const followUpsByDay = new Map(days.map((d) => [d, followUps.filter((r) => r.naechster_touch === d)]));
  const tasksByDay = new Map(days.map((d) => [d, tasks.filter((t) => t.due_on === d)]));
  // Überfälliges landet in der aktuellen Woche beim heutigen Tag.
  const overdueFollowUps = isCurrentWeek ? followUps.filter((r) => r.naechster_touch && r.naechster_touch < today) : [];
  const overdueTasks = isCurrentWeek ? tasks.filter((t) => t.due_on < today) : [];

  const weekFollowUps = [...followUpsByDay.values()].reduce((n, l) => n + l.length, 0);
  const dueBadge = followUps.filter((r) => r.naechster_touch && r.naechster_touch <= today).length;

  const navBtn = cn(buttonVariants({ variant: "secondary", size: "sm" }));

  return (
    <EfferdShell bare todoBadge={dueBadge}>
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              Plan
              <span className="text-xs font-normal text-fg-subtle">KW {isoWeek(monday)}</span>
            </span>
          }
          description={`${rangeFmt.format(ymdDate(monday))} – ${rangeFmt.format(ymdDate(sunday))} · ${events.length} ${showAll ? "Einträge" : "Termine"}${leadMeetings ? ` (${leadMeetings} mit Leads)` : ""} · ${weekFollowUps} Wiedervorlagen`}
          actions={
            <>
              <div className="mr-2 flex rounded-md border border-line-strong p-0.5 text-xs" role="group" aria-label="Kalenderfilter">
                <Link
                  href={weekQuery(monday, false)}
                  aria-current={!showAll}
                  className={cn("rounded px-2 py-1", !showAll ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:text-fg")}
                >
                  Nur Termine
                </Link>
                <Link
                  href={weekQuery(monday, true)}
                  aria-current={showAll}
                  className={cn("rounded px-2 py-1", showAll ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:text-fg")}
                >
                  Ganzer Kalender
                </Link>
              </div>
              <Link href={weekQuery(addDays(monday, -7))} className={navBtn} aria-label="Vorherige Woche">
                <ChevronLeft />
              </Link>
              <Link
                href={showAll ? "/plan?alle=1" : "/plan"}
                className={cn(navBtn, isCurrentWeek && "pointer-events-none opacity-50")}
                aria-disabled={isCurrentWeek}
              >
                Heute
              </Link>
              <Link href={weekQuery(addDays(monday, 7))} className={navBtn} aria-label="Nächste Woche">
                <ChevronRight />
              </Link>
            </>
          }
        />

        {"error" in calendar ? (
          <div className="flex items-center gap-2 border-b border-line bg-[var(--tone-amber-bg,transparent)] px-5 py-2 text-xs text-fg-muted">
            <TriangleAlert className="size-3.5 shrink-0 text-[var(--tone-amber-fg,currentColor)]" />
            {calendar.error} Wiedervorlagen und Aufgaben werden trotzdem angezeigt.
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="grid min-w-0 grid-cols-1 divide-y divide-line lg:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,0.7fr)_minmax(0,0.7fr)] lg:divide-x lg:divide-y-0 lg:min-h-full">
            {days.map((day) => {
              const isToday = day === today;
              const past = day < today;
              const dayEvents = eventsByDay.get(day) ?? [];
              const dayFollowUps = followUpsByDay.get(day) ?? [];
              const dayTasks = tasksByDay.get(day) ?? [];
              const showOverdue = isToday && (overdueFollowUps.length > 0 || overdueTasks.length > 0);
              const empty =
                dayEvents.length === 0 && dayFollowUps.length === 0 && dayTasks.length === 0 && !showOverdue;
              return (
                <section
                  key={day}
                  aria-label={dayFmt.format(ymdDate(day))}
                  className={cn("min-w-0 px-3 pb-4", isToday && "bg-accent/[0.03]", past && "bg-surface-2/40")}
                >
                  <header className="sticky top-0 z-10 -mx-3 mb-2 flex items-center justify-between border-b border-line bg-surface/95 px-3 py-2 backdrop-blur">
                    <span
                      className={cn(
                        "whitespace-nowrap text-[13px] font-semibold",
                        isToday ? "text-accent-fg" : past ? "text-fg-subtle" : "text-fg",
                      )}
                    >
                      {dayFmt.format(ymdDate(day))}
                    </span>
                    {isToday ? (
                      <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                        Heute
                      </span>
                    ) : null}
                  </header>

                  {dayEvents.length > 0 ? (
                    <ul className="space-y-1.5">
                      {dayEvents.map((ev) => (
                        <EventCard key={`${ev.id}-${day}`} ev={ev} day={day} past={past} />
                      ))}
                    </ul>
                  ) : null}

                  {showOverdue ? (
                    <>
                      <SectionTitle icon={<TriangleAlert />}>Überfällig</SectionTitle>
                      <ul className="divide-y divide-line">
                        {overdueFollowUps.map((r) => (
                          <FollowUpItem key={r.company_id} row={r} overdue />
                        ))}
                        {overdueTasks.map((t) => (
                          <TaskItem key={t.id} task={t} overdue />
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {dayFollowUps.length > 0 ? (
                    <>
                      <SectionTitle icon={<BellRing />}>
                        Wiedervorlagen <span className="font-normal normal-case">· {dayFollowUps.length}</span>
                      </SectionTitle>
                      <ul className="divide-y divide-line">
                        {dayFollowUps.map((r) => (
                          <FollowUpItem key={r.company_id} row={r} />
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {dayTasks.length > 0 ? (
                    <>
                      <SectionTitle icon={<CheckSquare />}>Aufgaben</SectionTitle>
                      <ul className="divide-y divide-line">
                        {dayTasks.map((t) => (
                          <TaskItem key={t.id} task={t} />
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {empty ? <p className="py-2 text-xs text-fg-subtle">Keine Termine</p> : null}
                  {(hiddenByDay.get(day)?.length ?? 0) > 0 ? (
                    <Link
                      href={weekQuery(monday, true)}
                      className="mt-2 block text-[11px] text-fg-subtle hover:text-fg"
                    >
                      + {hiddenByDay.get(day)!.length} Kalenderblöcke
                    </Link>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-5 py-1.5 text-[11px] text-fg-subtle">
          <CalendarDays className="size-3" />
          Termine aus Google Kalender. Orange umrandet = Teilnehmer ist Kontakt eines Leads.
          <a
            href="https://calendar.google.com/calendar/r/week"
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 hover:text-fg"
          >
            Google Kalender <ExternalLink className="size-3" />
          </a>
        </footer>
      </div>
    </EfferdShell>
  );
}
