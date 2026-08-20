import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyDetail } from "@/components/CompanyDetail";
import { EfferdShell } from "@/components/EfferdShell";
import {
  fetchCompany,
  fetchOpportunities,
  fetchPeople,
  fetchTouchpoints,
  fetchWorkspaceStats,
} from "@/lib/sales/queries";

export const dynamic = "force-dynamic";

export default async function FirmaPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  // Alle fünf Queries hängen nur an `companyId` — vorher liefen sie in zwei
  // aufeinanderfolgenden Wellen und kosteten eine vermeidbare Roundtrip-Runde.
  const [company, stats, people, touchpoints, opportunities] =
    await Promise.all([
      fetchCompany(companyId),
      fetchWorkspaceStats(),
      fetchPeople(companyId),
      fetchTouchpoints(companyId),
      fetchOpportunities(companyId),
    ]);
  if (!company) notFound();

  const back = company.relationship === "Kunde" ? "/kunden" : "/liste";

  return (
    <EfferdShell
      kpis={stats.kpis}
      activity={stats.activity}
      degraded={stats.degraded}
    >
      <p className="muted mb-1">
        <Link href={back} className="hover:text-rais-orange">
          ← Zurück zur Liste
        </Link>
      </p>
      <CompanyDetail
        company={company}
        people={people}
        touchpoints={touchpoints.rows}
        touchpointsTotal={touchpoints.total}
        opportunities={opportunities}
      />
    </EfferdShell>
  );
}
