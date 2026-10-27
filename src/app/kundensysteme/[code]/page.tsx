import { notFound } from "next/navigation";
import { EfferdShell } from "@/components/EfferdShell";
import { KundensystemDetail } from "@/components/KundensystemDetail";
import {
  countOpenTasksDueToday,
  fetchSystemChecks,
  fetchSystemStatus,
  fetchWorkspaceStats,
} from "@/lib/sales/queries";

export const dynamic = "force-dynamic";

export default async function KundensystemDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const normalized = code.trim().toUpperCase();

  const [system, checks, stats, todoBadge] = await Promise.all([
    fetchSystemStatus(normalized),
    fetchSystemChecks(normalized),
    fetchWorkspaceStats(),
    countOpenTasksDueToday(),
  ]);

  if (!system) {
    notFound();
  }

  return (
    <EfferdShell
      kpis={stats.kpis}
      activity={stats.activity}
      degraded={stats.degraded}
      todoBadge={todoBadge}
    >
      <KundensystemDetail system={system} checks={checks} />
    </EfferdShell>
  );
}
