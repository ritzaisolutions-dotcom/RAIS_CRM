import { EfferdShell } from "@/components/EfferdShell";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { PageHeader } from "@/components/ui/panel";
import { countDueLeads } from "@/lib/sales/leadQueries";
import { senderDisplayName } from "@/lib/sales/mail";
import { fetchEmailTemplates } from "@/lib/sales/queries";
import { listEmailAttachments } from "@/lib/sales/attachmentActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-Mail-Vorlagen" };

export default async function VorlagenPage() {
  const [templates, attachments, dueCount] = await Promise.all([
    fetchEmailTemplates(),
    listEmailAttachments(),
    countDueLeads(),
  ]);
  return (
    <EfferdShell bare todoBadge={dueCount}>
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="E-Mail-Vorlagen & Dokumente"
          description="Vorlagen mit Variablen wie {{vorname}}, dazu PDF-Dokumente (z. B. Broschüre), die du jeder Mail anhängen kannst."
        />
        <TemplateEditor templates={templates} senderName={senderDisplayName()} attachments={attachments} />
      </div>
    </EfferdShell>
  );
}
