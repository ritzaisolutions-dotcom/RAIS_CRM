import { CallListeTable } from "@/components/CallListeTable";
import { EfferdShell } from "@/components/EfferdShell";
import { fetchKundenListe, fetchWorkspaceStats } from "@/lib/sales/queries";

export default async function KundenPage() {
  const [rows, stats] = await Promise.all([
    fetchKundenListe(),
    fetchWorkspaceStats(),
  ]);

  return (
    <EfferdShell kpis={stats.kpis} activity={stats.activity}>
      <CallListeTable
        rows={rows}
        title="Kunden"
        subtitle={`${rows.length} Kunden · sortiert nach Firma`}
      />
    </EfferdShell>
  );
}
