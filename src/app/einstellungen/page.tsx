import { EfferdShell } from "@/components/EfferdShell";
import { ConnectionsPanel } from "@/components/ConnectionsPanel";
import { CustomFieldsPanel } from "@/components/CustomFieldsPanel";
import {
  EmailTemplatesPanel,
  SequencesPanel,
  WorkflowsPanel,
} from "@/components/SettingsPanels";
import { getConnectionStatus } from "@/lib/sales/actions";
import {
  countOpenTasksDueToday,
  fetchCustomFieldDefs,
  fetchEmailTemplates,
  fetchInboundQuarantine,
  fetchSequenceSteps,
  fetchSequences,
  fetchWorkflowRules,
  fetchWorkspaceStats,
} from "@/lib/sales/queries";
import { InboundQuarantinePanel } from "@/components/InboundQuarantinePanel";

export const dynamic = "force-dynamic";

export default async function EinstellungenPage() {
  const [
    stats,
    templates,
    sequences,
    rules,
    fieldDefs,
    todoBadge,
    connectionStatus,
    quarantine,
  ] = await Promise.all([
    fetchWorkspaceStats(),
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
    <EfferdShell
      kpis={stats.kpis}
      activity={stats.activity}
      degraded={stats.degraded}
      todoBadge={todoBadge}
    >
      <h1 className="m-0 font-[family-name:var(--font-source-serif)] text-2xl font-semibold">
        Einstellungen
      </h1>
      <p className="muted">
        Verbindungen (SMTP/IMAP/Cron), Vorlagen, freie Felder, Sequenzen und
        Workflows. Secrets nur in der Server-Umgebung.
      </p>
      <div className="stack" style={{ marginTop: "1rem" }}>
        <ConnectionsPanel status={connectionStatus} />
        <InboundQuarantinePanel items={quarantine} />
        <CustomFieldsPanel defs={fieldDefs} />
        <EmailTemplatesPanel templates={templates} />
        <SequencesPanel
          sequences={sequences}
          stepsBySequence={stepsBySequence}
        />
        <WorkflowsPanel rules={rules} />
      </div>
    </EfferdShell>
  );
}
