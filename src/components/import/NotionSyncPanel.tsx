"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { BUSINESS_TZ } from "@/lib/sales/dates";
import { statusLabel } from "@/lib/sales/leads";
import {
  applyNotionSync,
  previewNotionSync,
  type NotionSyncPreview,
  type NotionSyncResult,
  type NotionSyncState,
} from "@/lib/sales/notionSyncActions";
import type { PipelineStatus } from "@/lib/sales/types";

const stamp = new Intl.DateTimeFormat("de-DE", {
  timeZone: BUSINESS_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border border-line px-3 py-2">
      <div className={tone ?? "text-fg"}>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
      </div>
      <div className="text-xs text-fg-muted">{label}</div>
    </div>
  );
}

export function NotionSyncPanel({ state }: { state: NotionSyncState }) {
  const router = useRouter();
  const [preview, setPreview] = useState<NotionSyncPreview | null>(null);
  const [result, setResult] = useState<NotionSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [applying, startApply] = useTransition();

  function load() {
    setError(null);
    setResult(null);
    startLoad(async () => {
      const res = await previewNotionSync();
      if ("error" in res) {
        setPreview(null);
        setError(res.error);
        return;
      }
      setPreview(res);
    });
  }

  function apply() {
    setError(null);
    startApply(async () => {
      const res = await applyNotionSync();
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setResult(res);
      setPreview(null);
      router.refresh();
    });
  }

  if (!state.configured) {
    return (
      <div className="mx-auto max-w-3xl p-5">
        <Panel>
          <PanelHeader title="Notion verbinden" />
          <div className="space-y-3 p-4 text-[13px] leading-relaxed">
            <p>Damit der Sync die Datenbank „ImmoScout Makler Leads“ lesen kann, einmalig:</p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                In Notion unter <span className="font-medium">Einstellungen → Verbindungen → Integrationen entwickeln</span>{" "}
                eine interne Integration „RAIS CRM“ anlegen (nur Lesen reicht).
              </li>
              <li>
                Die Datenbank öffnen → <span className="font-medium">⋯ → Verbindungen</span> → „RAIS CRM“ hinzufügen.
              </li>
              <li>
                Das Secret der Integration in Vercel als <code className="rounded bg-surface-2 px-1">NOTION_TOKEN</code>{" "}
                eintragen (Production) und neu deployen. Lokal in <code className="rounded bg-surface-2 px-1">.env.local</code>.
              </li>
            </ol>
            <p className="text-fg-muted">Das Token bleibt auf dem Server und wird nie an den Browser geschickt.</p>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-5">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0 text-[13px]">
            <div className="font-medium">ImmoScout Makler Leads · nur ICP = JA</div>
            <div className="text-xs text-fg-muted">
              {state.lastSync
                ? `Letzter Sync: ${stamp.format(new Date(state.lastSync))}`
                : "Noch kein Sync. Der manuelle Import vom 26.11. gilt als Ausgangsstand."}
            </div>
          </div>
          <Button variant="secondary" onClick={load} disabled={loading || applying}>
            <RefreshCw className={loading ? "animate-spin" : undefined} />
            {loading ? "Lade aus Notion …" : "Änderungen prüfen"}
          </Button>
        </div>
        <div className="border-t border-line px-4 py-2.5 text-xs leading-relaxed text-fg-muted">
          Neue Leads werden angelegt. Bei bestehenden Leads füllt der Sync nur leere Felder; der Status wird nur
          übernommen, solange der Lead im CRM noch „Neu“ ist. Was du im CRM bearbeitet hast, wird nie überschrieben.
        </div>
      </Panel>

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-[var(--tone-red-fg)]/30 px-3 py-2 text-[13px] text-[var(--tone-red-fg)]">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {result ? (
        <Panel>
          <div className="flex items-start gap-2 p-4 text-[13px]">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-[var(--tone-green-fg,currentColor)]" />
            <div>
              <div className="font-medium">Sync abgeschlossen</div>
              <div className="text-fg-muted">
                {result.created} neu angelegt · {result.updated} ergänzt · {result.statuses} Status gesetzt ·{" "}
                {result.notes} Notizen
                {result.duplicates ? ` · ${result.duplicates} schon vorhanden` : ""}
              </div>
              {result.errors.length ? (
                <ul className="mt-2 list-disc pl-4 text-xs text-[var(--tone-red-fg)]">
                  {result.errors.slice(0, 10).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </Panel>
      ) : null}

      {preview ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="neu anlegen" value={preview.counts.create} tone="text-accent-fg" />
            <Stat label="ergänzen" value={preview.counts.update} />
            <Stat label="Konflikte (nur Info)" value={preview.counts.conflicts} tone={preview.counts.conflicts ? "text-[var(--tone-amber-fg,currentColor)]" : undefined} />
            <Stat label="übersprungen" value={preview.counts.skipped} tone="text-fg-subtle" />
          </div>

          {preview.create.length ? (
            <Panel className="overflow-hidden">
              <PanelHeader title={`Neue Leads · ${preview.create.length}`} />
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {preview.create.map((c) => (
                  <li key={`${c.firma}-${c.stadt}`} className="flex items-center justify-between gap-3 px-4 py-1.5 text-[13px]">
                    <span className="min-w-0 truncate">
                      {c.firma}
                      <span className="ml-1.5 text-xs text-fg-subtle">{c.stadt ?? ""}</span>
                    </span>
                    <Badge>{statusLabel(c.status as PipelineStatus)}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {preview.update.length ? (
            <Panel className="overflow-hidden">
              <PanelHeader title={`Bestehende Leads ergänzen · ${preview.update.length}`} />
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {preview.update.map((u) => (
                  <li key={u.firma} className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-[13px]">
                    <span className="min-w-0 truncate">{u.firma}</span>
                    <span className="text-xs text-fg-muted">
                      {[
                        u.fields.length ? u.fields.join(", ") : null,
                        u.status ? `Status → ${statusLabel(u.status as PipelineStatus)}` : null,
                        u.note ? "neue Notiz" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {preview.conflicts.length ? (
            <Panel className="overflow-hidden">
              <PanelHeader
                title={
                  <span className="flex items-center gap-1.5">
                    <TriangleAlert className="size-3.5 text-[var(--tone-amber-fg,currentColor)]" />
                    Notion weicht vom CRM ab · {preview.conflicts.length}
                  </span>
                }
              />
              <p className="px-4 pt-2 text-xs text-fg-muted">
                Diese Leads wurden in Notion nach dem letzten Sync geändert, haben im CRM aber schon einen Status. Der Sync
                ändert sie nicht. Prüfe sie bei Bedarf selbst.
              </p>
              <ul className="divide-y divide-line">
                {preview.conflicts.map((c) => (
                  <li key={c.companyId} className="flex items-center justify-between gap-3 px-4 py-1.5 text-[13px]">
                    <a href={`/firma/${c.companyId}`} className="min-w-0 truncate hover:underline">
                      {c.firma}
                    </a>
                    <span className="text-xs text-fg-muted">
                      CRM: {statusLabel(c.crm as PipelineStatus)} · Notion: {c.notion}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {preview.skipped.length ? (
            <p className="text-xs text-fg-subtle">
              Übersprungen: {preview.skipped.map((s) => `${s.count}× ${s.reason}`).join(" · ")}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <span className="text-xs text-fg-muted">{preview.pages} Seiten mit ICP = JA in Notion gelesen</span>
            <Button onClick={apply} disabled={applying || (preview.counts.create === 0 && preview.counts.update === 0)}>
              {applying ? "Wird übernommen …" : "Übernehmen"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
