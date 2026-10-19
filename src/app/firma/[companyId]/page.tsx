import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyDetail } from "@/components/CompanyDetail";
import { EfferdShell } from "@/components/EfferdShell";
import {
  countOpenTasksDueToday,
  fetchCompany,
  fetchCompanyCustomValues,
  fetchCompanyEnrollments,
  fetchCompanyTasks,
  fetchCustomFieldDefs,
  fetchEmailTemplates,
  fetchOpportunities,
  fetchPeople,
  fetchSequences,
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
  const [
    company,
    stats,
    people,
    touchpoints,
    opportunities,
    tasks,
    templates,
    sequences,
    enrollments,
    customDefs,
    customValues,
    todoBadge,
  ] = await Promise.all([
    fetchCompany(companyId),
    fetchWorkspaceStats(),
    fetchPeople(companyId),
    fetchTouchpoints(companyId),
    fetchOpportunities(companyId),
    fetchCompanyTasks(companyId),
    fetchEmailTemplates(),
    fetchSequences(),
    fetchCompanyEnrollments(companyId),
    fetchCustomFieldDefs(true),
    fetchCompanyCustomValues(companyId),
    countOpenTasksDueToday(),
  ]);
  if (!company) notFound();

  const back = company.relationship === "Kunde" ? "/kunden" : "/liste";

  return (
    <EfferdShell
      kpis={stats.kpis}
      activity={stats.activity}
      degraded={stats.degraded}
      todoBadge={todoBadge}
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
        tasks={tasks}
        templates={templates}
        sequences={sequences}
        enrollments={enrollments}
        customDefs={customDefs}
        customValues={customValues}
      />
    </EfferdShell>
  );
}
