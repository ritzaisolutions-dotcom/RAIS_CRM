import Link from "next/link";
import { EfferdShell } from "@/components/EfferdShell";
import { ConnectionsPanel } from "@/components/ConnectionsPanel";
import { CustomFieldsPanel } from "@/components/CustomFieldsPanel";
import { SequencesPanel, WorkflowsPanel } from "@/components/SettingsPanels";
import { PageHeader } from "@/components/ui/panel";
import { getConnectionStatus } from "@/lib/sales/actions";
import {
  countOpenTasksDueToday,
  fetchCustomFieldDefs,
  fetchEmailTemplates,
  fetchInboundQuarantine,
  fetchSequenceSteps,
  fetchSequences,
  fetchWorkflowRules,
} from "@/lib/sales/queries";
import { InboundQuarantinePanel } from "@/components/InboundQuarantinePanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einstellungen" };

export default async function EinstellungenPage() {
  const [
    templates,
    sequences,
    rules,
    fieldDefs,
    todoBadge,
    connectionStatus,
    quarantine,
  ] = await Promise.all([
    fetchEmailTemplates(),
    fetchSequences(),
    fetchWorkflowRules(),
    fetchCustomFieldDefs(false),
    countOpenTasksDueToday(),
    getConnectionStatus(),
    fetchInboundQuarantine(),
  ]);

  const stepsBySequence: Record<
    string,
    Awaited<ReturnType<typeof fetchSequenceSteps>>
  > = {};
  await Promise.all(
    sequences.map(async (s) => {
      stepsBySequence[s.id] = await fetchSequenceSteps(s.id);
    }),
  );

  return (
    <EfferdShell bare todoBadge={todoBadge}>
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="Einstellungen"
          description="Verbindungen, freie Felder, Sequenzen und Workflows. Secrets liegen nur in der Server-Umgebung."
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="stack mx-auto max-w-5xl p-5">
            <ConnectionsPanel status={connectionStatus} />
            <InboundQuarantinePanel items={quarantine} />
            <CustomFieldsPanel defs={fieldDefs} />
            <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 text-[13px]">
              <span>
                E-Mail-Vorlagen
                <span className="ml-1.5 text-xs text-fg-muted">{templates.length} gespeichert</span>
              </span>
              <Link href="/vorlagen" className="font-medium text-accent-fg hover:underline">
                Zu den Vorlagen →
              </Link>
            </div>
            <SequencesPanel sequences={sequences} stepsBySequence={stepsBySequence} />
            <WorkflowsPanel rules={rules} />
          </div>
        </div>
      </div>
    </EfferdShell>
  );
}
