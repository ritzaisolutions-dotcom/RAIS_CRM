import { EfferdShell } from "@/components/EfferdShell";
import { ListeWorkspace } from "@/components/ListeWorkspace";
import {
  countOpenTasksDueToday,
  fetchCustomFieldDefs,
  fetchCustomValuesForCompanies,
  fetchLeadLists,
  fetchOpenTasksDue,
  fetchSequences,
  fetchTermineListe,
  fetchWorkspaceStats,
} from "@/lib/sales/queries";
import type { ListeSort } from "@/lib/sales/types";

export const dynamic = "force-dynamic";

function parseSort(value: string | undefined): ListeSort {
  return value === "firma" || value === "faellig" || value === "tage"
    ? value
    : "";
}

function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export default async function TerminePage({
  searchParams,
}: {
  searchParams: Promise<{
    sort?: string;
    page?: string;
    q?: string;
    list?: string;
  }>;
}) {
  const params = await searchParams;
  const sort = parseSort(params.sort);
  const page = parsePage(params.page);
  const q = params.q?.trim() ?? "";
  const listId = params.list?.trim() ?? "";

  const [liste, stats, tasks, leadLists, sequences, customDefs, todoBadge] =
    await Promise.all([
      fetchTermineListe({ sort, page, q, listId: listId || undefined }),
      fetchWorkspaceStats(),
      fetchOpenTasksDue("all"),
      fetchLeadLists(),
      fetchSequences(),
      fetchCustomFieldDefs(true),
      countOpenTasksDueToday(),
    ]);
  const customValues = await fetchCustomValuesForCompanies(
    liste.rows.map((r) => r.company_id),
  );

  const shown = liste.rows.length;
  const rangeNote =
    liste.total > shown
      ? `${(liste.page - 1) * liste.pageSize + 1}–${(liste.page - 1) * liste.pageSize + shown} von ${liste.total}`
      : `${liste.total} Termine`;

  return (
    <EfferdShell
      kpis={stats.kpis}
      activity={stats.activity}
      degraded={stats.degraded}
      todoBadge={todoBadge}
    >
      <ListeWorkspace
        rows={liste.rows}
        title="Termine"
        subtitle={`${rangeNote} · Sales-Calls (nicht Kunden)${q ? ` · Suche "${q}"` : ""}`}
        initialSort={sort}
        initialQuery={q}
        initialListId={listId}
        page={liste.page}
        pageSize={liste.pageSize}
        total={liste.total}
        hideStatusFilters
        tasks={tasks}
        savedViews={[]}
        leadLists={leadLists}
        sequences={sequences}
        customDefs={customDefs}
        customValues={customValues}
        desk="termine"
      />
    </EfferdShell>
  );
}
