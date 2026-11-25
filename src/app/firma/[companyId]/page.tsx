import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EfferdShell } from "@/components/EfferdShell";
import { LeadDetail } from "@/components/lead/LeadDetail";
import type { ComposerTab } from "@/components/lead/Composer";
import { countDueLeads } from "@/lib/sales/leadQueries";
import { countContactAttempts } from "@/lib/sales/leadActions";
import {
  fetchCompany,
  fetchCompanyCustomValues,
  fetchCompanyTasks,
  fetchCustomFieldDefs,
  fetchEmailTemplates,
  fetchOpportunities,
  fetchPeople,
  fetchTouchpoints,
} from "@/lib/sales/queries";
import { senderDisplayName } from "@/lib/sales/mail";
import { asanaConfigured } from "@/lib/integrations/asana";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companyId: string }>;
}): Promise<Metadata> {
  const { companyId } = await params;
  const company = await fetchCompany(companyId).catch(() => null);
  return { title: company?.name ?? "Lead" };
}

const TABS: ComposerTab[] = ["note", "email", "call", "task"];

export default async function FirmaPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { companyId } = await params;
  const { tab } = await searchParams;
  const [
    company,
    people,
    touchpoints,
    opportunities,
    tasks,
    templates,
    customDefs,
    customValues,
    dueCount,
    contactCount,
  ] = await Promise.all([
    fetchCompany(companyId),
    fetchPeople(companyId),
    fetchTouchpoints(companyId),
    fetchOpportunities(companyId),
    fetchCompanyTasks(companyId),
    fetchEmailTemplates(),
    fetchCustomFieldDefs(true),
    fetchCompanyCustomValues(companyId),
    countDueLeads(),
    countContactAttempts(companyId),
  ]);
  if (!company) notFound();

  // Wie `v_company_status`: jüngster nicht stornierter Touch mit Wiedervorlage.
  const nextTouch =
    touchpoints.rows.find((t) => !t.voided_at && t.naechster_touch)?.naechster_touch ?? null;

  return (
    <EfferdShell bare todoBadge={dueCount}>
      <LeadDetail
        company={company}
        people={people}
        touchpoints={touchpoints.rows}
        touchpointsTotal={touchpoints.total}
        opportunities={opportunities}
        tasks={tasks}
        templates={templates}
        customDefs={customDefs}
        customValues={customValues}
        senderName={senderDisplayName()}
        nextTouch={nextTouch}
        contactCount={contactCount}
        asanaConfigured={asanaConfigured()}
        initialTab={TABS.includes(tab as ComposerTab) ? (tab as ComposerTab) : "note"}
      />
    </EfferdShell>
  );
}
