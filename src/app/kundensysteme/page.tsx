import { EfferdShell } from "@/components/EfferdShell";
import { KundensystemeTable } from "@/components/KundensystemeTable";
import {
  countOpenTasksDueToday,
  fetchSystemStatusList,
  fetchWorkspaceStats,
} from "@/lib/sales/queries";

export const dynamic = "force-dynamic";

export default async function KundensystemePage() {
  const [rows, stats, todoBadge] = await Promise.all([
    fetchSystemStatusList(),
    fetchWorkspaceStats(),
    countOpenTasksDueToday(),
  ]);

  return (
    <EfferdShell
      kpis={stats.kpis}
      activity={stats.activity}
      degraded={stats.degraded}
      todoBadge={todoBadge}
    >
      <KundensystemeTable rows={rows} />
    </EfferdShell>
  );
}
