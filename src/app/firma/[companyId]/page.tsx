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
  const [company, stats] = await Promise.all([
    fetchCompany(companyId),
    fetchWorkspaceStats(),
  ]);
  if (!company) notFound();

  const [people, touchpoints, opportunities] = await Promise.all([
    fetchPeople(companyId),
    fetchTouchpoints(companyId),
    fetchOpportunities(companyId),
  ]);

  const back =
    company.relationship === "Kunde" ? "/kunden" : "/liste";

  return (
    <EfferdShell kpis={stats.kpis} activity={stats.activity}>
      <p className="muted mb-1">
        <Link href={back} className="hover:text-rais-orange">
          ← Zurück zur Liste
        </Link>
      </p>
      <CompanyDetail
        company={company}
        people={people}
        touchpoints={touchpoints}
        opportunities={opportunities}
      />
    </EfferdShell>
  );
}
