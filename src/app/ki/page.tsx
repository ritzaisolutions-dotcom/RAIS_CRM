import { EfferdShell } from "@/components/EfferdShell";
import { KiChat } from "@/components/ki/KiChat";
import { PageHeader } from "@/components/ui/panel";
import { listAiProviders } from "@/lib/ai/providers";
import { countDueLeads } from "@/lib/sales/leadQueries";

export const dynamic = "force-dynamic";
export const metadata = { title: "KI-Chat" };

export default async function KiPage() {
  const [providers, dueBadge] = await Promise.all([listAiProviders(), countDueLeads()]);
  const active = providers.filter((p) => p.configured).length;

  return (
    <EfferdShell bare todoBadge={dueBadge}>
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title="KI-Chat"
          description={`${active} von ${providers.length} Anbietern eingerichtet · Keys liegen nur auf dem Server`}
        />
        <div className="min-h-0 flex-1">
          <KiChat providers={providers} />
        </div>
      </div>
    </EfferdShell>
  );
}
