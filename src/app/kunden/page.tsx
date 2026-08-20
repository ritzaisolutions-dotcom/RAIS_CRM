import { CallListeTable } from "@/components/CallListeTable";
import { EfferdShell } from "@/components/EfferdShell";
import { fetchKundenListe, fetchWorkspaceStats } from "@/lib/sales/queries";
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

export default async function KundenPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const sort = parseSort(params.sort);
  const page = parsePage(params.page);
  const q = params.q?.trim() ?? "";

  const [liste, stats] = await Promise.all([
    fetchKundenListe({ sort, page, q }),
    fetchWorkspaceStats(),
  ]);

  const shown = liste.rows.length;
  const rangeNote =
    liste.total > shown
      ? `${(liste.page - 1) * liste.pageSize + 1}–${(liste.page - 1) * liste.pageSize + shown} von ${liste.total}`
      : `${liste.total} Kunden`;

  return (
    <EfferdShell
      kpis={stats.kpis}
      activity={stats.activity}
      degraded={stats.degraded}
    >
      <CallListeTable
        rows={liste.rows}
        title="Kunden"
        subtitle={`${rangeNote}${q ? ` · Suche "${q}"` : ""}`}
        initialSort={sort}
        initialQuery={q}
        page={liste.page}
        pageSize={liste.pageSize}
        total={liste.total}
        hideStatusFilters
      />
    </EfferdShell>
  );
}
