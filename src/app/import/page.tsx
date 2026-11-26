import { EfferdShell } from "@/components/EfferdShell";
import { ImportWizard } from "@/components/import/ImportWizard";
import { NotionSyncPanel } from "@/components/import/NotionSyncPanel";
import { PageHeader } from "@/components/ui/panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { countDueLeads } from "@/lib/sales/leadQueries";
import { getNotionSyncState } from "@/lib/sales/notionSyncActions";
import { fetchLeadLists } from "@/lib/sales/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import" };

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const [lists, dueCount, notion] = await Promise.all([
    fetchLeadLists(),
    countDueLeads(),
    getNotionSyncState(),
  ]);
  return (
    <EfferdShell bare todoBadge={dueCount}>
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="Leads importieren"
          description="Neue Stände aus Notion übernehmen oder eine CSV aus Excel/Sheets importieren."
        />
        <Tabs defaultValue={tab === "csv" ? "csv" : "notion"} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="shrink-0 px-5">
            <TabsTrigger value="notion">Notion-Sync</TabsTrigger>
            <TabsTrigger value="csv">CSV-Datei</TabsTrigger>
          </TabsList>
          <TabsContent value="notion" className="min-h-0 flex-1 overflow-y-auto">
            <NotionSyncPanel state={notion} />
          </TabsContent>
          <TabsContent value="csv" className="min-h-0 flex-1 overflow-y-auto">
            <ImportWizard lists={lists} />
          </TabsContent>
        </Tabs>
      </div>
    </EfferdShell>
  );
}
