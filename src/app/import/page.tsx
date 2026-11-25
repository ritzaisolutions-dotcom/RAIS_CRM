import { EfferdShell } from "@/components/EfferdShell";
import { ImportWizard } from "@/components/import/ImportWizard";
import { PageHeader } from "@/components/ui/panel";
import { countDueLeads } from "@/lib/sales/leadQueries";
import { fetchLeadLists } from "@/lib/sales/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import" };

export default async function ImportPage() {
  const [lists, dueCount] = await Promise.all([fetchLeadLists(), countDueLeads()]);
  return (
    <EfferdShell bare todoBadge={dueCount}>
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="Leads importieren"
          description="CSV aus Notion, Excel oder Sheets — mit Spaltenzuordnung, Bereinigung und Dubletten-Prüfung."
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ImportWizard lists={lists} />
        </div>
      </div>
    </EfferdShell>
  );
}
