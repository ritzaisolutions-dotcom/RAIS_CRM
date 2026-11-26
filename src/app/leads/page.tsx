import Link from "next/link";
import { EfferdShell } from "@/components/EfferdShell";
import { LeadsWorkspace } from "@/components/leads/LeadsWorkspace";
import { PageHeader } from "@/components/ui/panel";
import { countDueLeads, fetchLeadViewCounts, fetchLeads } from "@/lib/sales/leadQueries";
import {
  LEAD_VIEWS,
  parseLeadSort,
  parseLeadView,
  type LeadViewKey,
} from "@/lib/sales/leads";
import { fetchLeadLists } from "@/lib/sales/queries";
import { LEAD_QUELLEN, type LeadQuelle } from "@/lib/sales/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

const VIEW_DOT: Partial<Record<LeadViewKey, string>> = {
  faellig: "bg-accent",
  neu: "bg-[var(--tone-blue-fg)]",
  nicht_erreicht: "bg-[var(--tone-gray-fg)]",
  rueckruf: "bg-[var(--tone-orange-fg)]",
  termin: "bg-[var(--tone-violet-fg)]",
  closing: "bg-[var(--tone-yellow-fg)]",
  kunden: "bg-[var(--tone-green-fg)]",
  kein_interesse: "bg-[var(--tone-red-fg)]",
};

function hrefFor(view: LeadViewKey, listId?: string) {
  const p = new URLSearchParams();
  if (view !== "alle") p.set("view", view);
  if (listId) p.set("list", listId);
  const s = p.toString();
  return s ? `/leads?${s}` : "/leads";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    quelle?: string;
    kat?: string;
    sort?: string;
    page?: string;
    list?: string;
  }>;
}) {
  const params = await searchParams;
  const view = parseLeadView(params.view);
  const sort = parseLeadSort(params.sort);
  const quelle = LEAD_QUELLEN.includes(params.quelle as LeadQuelle)
    ? (params.quelle as LeadQuelle)
    : "";
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const q = params.q?.trim() ?? "";

  const [lists, counts, dueCount] = await Promise.all([
    fetchLeadLists(),
    fetchLeadViewCounts(),
    countDueLeads(),
  ]);
  const listId = lists.some((l) => l.id === params.list) ? params.list : undefined;
  const kategorie = (["lead", "kontakt", "kunde"].includes(params.kat ?? "") ? params.kat : "") as
    | "lead"
    | "kontakt"
    | "kunde"
    | "";
  const result = await fetchLeads({ view, q, quelle, kategorie, sort, page, listId });

  const viewLabel = LEAD_VIEWS.find((v) => v.key === view)?.label ?? "Leads";
  const activeList = lists.find((l) => l.id === listId);

  return (
    <EfferdShell bare todoBadge={dueCount}>
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title={activeList ? `${viewLabel} · ${activeList.name}` : viewLabel}
          description={`${result.total} ${result.total === 1 ? "Lead" : "Leads"}`}
        />
        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Ansichten"
            className="hidden w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-surface px-2 py-3 lg:flex"
          >
            <div>
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                Ansichten
              </p>
              <ul className="grid gap-px">
                {LEAD_VIEWS.map((v) => {
                  const active = v.key === view;
                  return (
                    <li key={v.key}>
                      <Link
                        href={hrefFor(v.key, listId)}
                        className={cn(
                          "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] transition-colors",
                          active
                            ? "bg-surface-2 font-medium text-fg"
                            : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            VIEW_DOT[v.key] ?? "bg-transparent",
                          )}
                        />
                        <span className="flex-1 truncate">{v.label}</span>
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            v.key === "faellig" && counts[v.key] > 0
                              ? "font-semibold text-accent-fg"
                              : "text-fg-subtle",
                          )}
                        >
                          {counts[v.key]}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            {lists.length > 0 ? (
              <div>
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                  Listen
                </p>
                <ul className="grid gap-px">
                  {lists.map((l) => {
                    const active = l.id === listId;
                    return (
                      <li key={l.id}>
                        <Link
                          href={hrefFor(view, active ? undefined : l.id)}
                          className={cn(
                            "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] transition-colors",
                            active
                              ? "bg-surface-2 font-medium text-fg"
                              : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                          )}
                          title={active ? "Liste abwählen" : l.name}
                        >
                          <span className="flex-1 truncate">{l.name}</span>
                          <span className="text-xs tabular-nums text-fg-subtle">
                            {l.member_count ?? ""}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Ansichten auf kleinen Bildschirmen als Leiste */}
            <div className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-1.5 lg:hidden">
              {LEAD_VIEWS.map((v) => (
                <Link
                  key={v.key}
                  href={hrefFor(v.key, listId)}
                  className={cn(
                    "shrink-0 rounded-md px-2 py-1 text-xs",
                    v.key === view ? "bg-surface-2 font-medium text-fg" : "text-fg-muted",
                  )}
                >
                  {v.label} <span className="text-fg-subtle">{counts[v.key]}</span>
                </Link>
              ))}
            </div>
            <LeadsWorkspace
              rows={result.rows}
              total={result.total}
              page={result.page}
              pageSize={result.pageSize}
              q={q}
              quelle={quelle}
              kategorie={kategorie}
              sort={sort}
              lists={lists}
              viewLabel={viewLabel}
            />
          </div>
        </div>
      </div>
    </EfferdShell>
  );
}
