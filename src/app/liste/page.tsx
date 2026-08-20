import { CallListeTable } from "@/components/CallListeTable";
import { EfferdShell } from "@/components/EfferdShell";
import { fetchCallListe, fetchWorkspaceStats } from "@/lib/sales/queries";
import type {
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

export default async function ListePage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    due?: string;
    sort?: string;
    page?: string;
    q?: string;
  }>;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const due = parseDue(params.due);
  const sort = parseSort(params.sort);
  const page = parsePage(params.page);
  const q = params.q?.trim() ?? "";

  const [liste, stats] = await Promise.all([
    fetchCallListe({ status, due, sort, page, q }),
    fetchWorkspaceStats(),
  ]);

  const filterNote = [
    status ? `Status ${status}` : null,
    due === "today" ? "fällig heute" : due === "overdue" ? "überfällig" : null,
    q ? `Suche "${q}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const sortNote =
    sort === "firma"
      ? "sortiert nach Firma"
      : sort === "faellig"
        ? "sortiert nach Fälligkeit"
        : sort === "tage"
          ? "sortiert nach Tagen seit Touch"
          : "sortiert nach Anruf-Priorität";

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
    >
      <CallListeTable
        rows={liste.rows}
        title="Prospects"
        subtitle={`${rangeNote}${filterNote ? ` · ${filterNote}` : ""} · ${sortNote}`}
        showCreate
        initialStatus={status}
        initialDue={due}
        initialSort={sort}
        initialQuery={q}
        page={liste.page}
        pageSize={liste.pageSize}
        total={liste.total}
      />
    </EfferdShell>
  );
}
