import { CallListeTable } from "@/components/CallListeTable";
import type { ListeDueFilter } from "@/components/CallListeTable";
import { EfferdShell } from "@/components/EfferdShell";
import { fetchCallListe, fetchWorkspaceStats } from "@/lib/sales/queries";
import type { PipelineStatus } from "@/lib/sales/types";
import { PIPELINE_STATUS_OPTIONS } from "@/lib/sales/types";

function parseStatus(value: string | undefined): PipelineStatus | "" {
  return PIPELINE_STATUS_OPTIONS.includes(value as PipelineStatus)
    ? (value as PipelineStatus)
    : "";
}

function parseDue(value: string | undefined): ListeDueFilter {
  return value === "today" || value === "overdue" ? value : "";
}

export default async function ListePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; due?: string }>;
}) {
  const params = await searchParams;
  const [rows, stats] = await Promise.all([
    fetchCallListe(),
    fetchWorkspaceStats(),
  ]);

  return (
    <EfferdShell kpis={stats.kpis} activity={stats.activity}>
      <CallListeTable
        rows={rows}
        title="Prospects"
        subtitle={`${rows.length} Prospects · sortiert nach Firma`}
        showCreate
        initialStatus={parseStatus(params.status)}
        initialDue={parseDue(params.due)}
      />
    </EfferdShell>
  );
}
