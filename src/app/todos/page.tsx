import { EfferdShell } from "@/components/EfferdShell";
import { TodosInbox } from "@/components/TodosInbox";
import {
  countOpenTasksDueToday,
  fetchOpenTasksDue,
  fetchWorkspaceStats,
} from "@/lib/sales/queries";
import type { OpenTasksFilter } from "@/lib/sales/queries";
import type { TaskArt } from "@/lib/sales/types";

export const dynamic = "force-dynamic";

function parseFilter(value: string | undefined): OpenTasksFilter {
  if (
    value === "today" ||
    value === "overdue" ||
    value === "week" ||
    value === "all"
  ) {
    return value;
  }
  return "today";
}

function parseArt(value: string | undefined): TaskArt | "" {
  if (value === "follow_up" || value === "email" || value === "sonstiges") {
    return value;
  }
  return "";
}

export default async function TodosPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; art?: string }>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.filter);
  const art = parseArt(params.art);

  const [stats, tasks, todoBadge] = await Promise.all([
    fetchWorkspaceStats(),
    fetchOpenTasksDue(filter, art ? { art } : undefined),
    countOpenTasksDueToday(),
  ]);

  return (
    <EfferdShell
      kpis={stats.kpis}
      activity={stats.activity}
      degraded={stats.degraded}
      todoBadge={todoBadge}
    >
      <TodosInbox
        tasks={tasks}
        initialFilter={filter}
        initialArt={art}
        badgeCount={todoBadge}
      />
    </EfferdShell>
  );
}
