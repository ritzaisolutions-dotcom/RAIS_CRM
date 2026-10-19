import { EfferdShell } from "@/components/EfferdShell";
import {
  EmailTemplatesPanel,
  SequencesPanel,
  WorkflowsPanel,
} from "@/components/SettingsPanels";
import {
  fetchEmailTemplates,
  fetchSequenceSteps,
  fetchSequences,
  fetchWorkflowRules,
  fetchWorkspaceStats,
} from "@/lib/sales/queries";

export const dynamic = "force-dynamic";

export default async function EinstellungenPage() {
  const [stats, templates, sequences, rules] = await Promise.all([
    fetchWorkspaceStats(),
    fetchEmailTemplates(),
    fetchSequences(),
    fetchWorkflowRules(),
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
    >
      <h1 className="m-0 font-[family-name:var(--font-source-serif)] text-2xl font-semibold">
        Einstellungen
      </h1>
      <p className="muted">
        Vorlagen, Sequenzen und Workflows für die Close-artigen CRM-Jobs.
        E-Mail/SMS-Versand braucht optionale Provider-Env (SMTP_*, SMS_*).
      </p>
      <div className="stack" style={{ marginTop: "1rem" }}>
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
