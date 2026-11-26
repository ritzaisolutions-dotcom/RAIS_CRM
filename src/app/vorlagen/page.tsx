import { EfferdShell } from "@/components/EfferdShell";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { PageHeader } from "@/components/ui/panel";
import { countDueLeads } from "@/lib/sales/leadQueries";
import { senderDisplayName } from "@/lib/sales/mail";
import { fetchEmailTemplates } from "@/lib/sales/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-Mail-Vorlagen" };

export default async function VorlagenPage() {
  const [templates, dueCount] = await Promise.all([fetchEmailTemplates(), countDueLeads()]);
  return (
    <EfferdShell bare todoBadge={dueCount}>
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="E-Mail-Vorlagen"
          description="Mit Variablen wie {{vorname}} oder ganz ohne — beim Senden werden sie mit den Lead-Daten gefüllt."
        />
        <TemplateEditor templates={templates} senderName={senderDisplayName()} />
      </div>
    </EfferdShell>
  );
}
