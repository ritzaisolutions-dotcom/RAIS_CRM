import Link from "next/link";
import { EfferdShell } from "@/components/EfferdShell";
import { SessionDialer } from "@/components/SessionDialer";
import {
  countOpenTasksDueToday,
  fetchDialerQueue,
  fetchWorkspaceStats,
} from "@/lib/sales/queries";
import type {
  DialenQueue,
  ListeDueFilter,
  ListeSort,
  PipelineStatus,
} from "@/lib/sales/types";
import { PIPELINE_STATUS_OPTIONS } from "@/lib/sales/types";

export const dynamic = "force-dynamic";

function parseStatus(value: string | undefined): PipelineStatus | "" {
  return PIPELINE_STATUS_OPTIONS.includes(value as PipelineStatus)
    ? (value as PipelineStatus)
    : "";
}

function parseDue(value: string | undefined): ListeDueFilter {
  return value === "today" || value === "overdue" ? value : "";
}

function parseSort(value: string | undefined): ListeSort {
  return value === "firma" || value === "faellig" || value === "tage"
    ? value
    : "";
}

function parseQueue(value: string | undefined): DialenQueue {
  if (
    value === "today" ||
    value === "wiedervorlage" ||
    value === "no_phone" ||
    value === "call"
  ) {
    return value;
  }
  return "";
}

export default async function DialenPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    due?: string;
    sort?: string;
    q?: string;
    list?: string;
    queue?: string;
  }>;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const due = parseDue(params.due);
  const sort = parseSort(params.sort);
  const q = params.q?.trim() ?? "";
  const listId = params.list?.trim() ?? "";
  const queue = parseQueue(params.queue);

  const [dialQueue, stats, todoBadge] = await Promise.all([
    fetchDialerQueue({
      status,
      due,
      sort,
      q,
      listId: listId || undefined,
      queue,
    }),
    fetchWorkspaceStats(),
    countOpenTasksDueToday(),
  ]);

  const backParams = new URLSearchParams();
  if (status) backParams.set("status", status);
  if (due) backParams.set("due", due);
  if (sort) backParams.set("sort", sort);
  if (q) backParams.set("q", q);
  if (listId) backParams.set("list", listId);
  if (queue) backParams.set("queue", queue);
  const backHref = `/liste${backParams.toString() ? `?${backParams}` : ""}`;

  return (
    <EfferdShell
      kpis={stats.kpis}
      activity={stats.activity}
      degraded={stats.degraded}
      todoBadge={todoBadge}
      focus
    >
      <p className="muted mb-2">
        <Link href={backHref}>← Zurück zu Dialen</Link>
      </p>
      <SessionDialer
        rows={dialQueue.rows}
        truncated={dialQueue.truncated}
        backHref={backHref}
      />
    </EfferdShell>
  );
}
