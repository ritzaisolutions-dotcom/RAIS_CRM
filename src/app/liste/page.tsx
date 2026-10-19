import { EfferdShell } from "@/components/EfferdShell";
import { ListeWorkspace } from "@/components/ListeWorkspace";
import {
  countOpenTasksDueToday,
  fetchCallListe,
  fetchCustomFieldDefs,
  fetchCustomValuesForCompanies,
  fetchLeadLists,
  fetchOpenTasksDue,
  fetchSavedViewsWithCounts,
  fetchSequences,
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

function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
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

export default async function ListePage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    due?: string;
    sort?: string;
    page?: string;
    q?: string;
    list?: string;
    queue?: string;
  }>;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const due = parseDue(params.due);
  const sort = parseSort(params.sort);
  const page = parsePage(params.page);
  const q = params.q?.trim() ?? "";
  const listId = params.list?.trim() ?? "";
  const queue = parseQueue(params.queue);

  const [
    liste,
    stats,
    tasks,
    savedViews,
    leadLists,
    customDefs,
    sequences,
    todoBadge,
  ] = await Promise.all([
    fetchCallListe({
      status,
      due,
      sort,
      page,
      q,
      listId: listId || undefined,
      queue,
    }),
    fetchWorkspaceStats(),
    fetchOpenTasksDue("all"),
    fetchSavedViewsWithCounts("liste"),
    fetchLeadLists(),
    fetchCustomFieldDefs(true),
    fetchSequences(),
    countOpenTasksDueToday(),
  ]);
  const customValues = await fetchCustomValuesForCompanies(
    liste.rows.map((r) => r.company_id),
  );

  const filterNote = [
    status ? `Status ${status}` : null,
    due === "today" ? "fällig heute" : due === "overdue" ? "überfällig" : null,
    queue === "today"
      ? "Anrufliste heute"
      : queue === "wiedervorlage"
        ? "Wiedervorlage"
        : queue === "no_phone"
          ? "ohne Telefon"
          : queue === "call"
            ? "CALL"
            : null,
    q ? `Suche "${q}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const shown = liste.rows.length;
  const rangeNote =
    liste.total > shown
      ? `${(liste.page - 1) * liste.pageSize + 1}–${(liste.page - 1) * liste.pageSize + shown} von ${liste.total}`
      : `${liste.total} Prospects`;

  return (
    <EfferdShell
      kpis={stats.kpis}
      activity={stats.activity}
      degraded={stats.degraded}
      todoBadge={todoBadge}
    >
      <ListeWorkspace
        rows={liste.rows}
        title="Dialen"
        subtitle={`${rangeNote}${filterNote ? ` · ${filterNote}` : ""}`}
        showCreate
        initialStatus={status}
        initialDue={due}
        initialSort={sort}
        initialQuery={q}
        initialListId={listId}
        initialQueue={queue}
        page={liste.page}
        pageSize={liste.pageSize}
        total={liste.total}
        tasks={tasks}
        savedViews={savedViews}
        leadLists={leadLists}
        sequences={sequences}
        customDefs={customDefs}
        customValues={customValues}
        desk="dialen"
      />
    </EfferdShell>
  );
}
