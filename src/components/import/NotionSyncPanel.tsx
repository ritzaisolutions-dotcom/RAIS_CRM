"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { unzipSync } from "fflate";
import { CircleAlert, CircleCheck, FileArchive, RefreshCw, TriangleAlert, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { BUSINESS_TZ } from "@/lib/sales/dates";
import { statusLabel } from "@/lib/sales/leads";
import { parseNotionExport, type ExportFile } from "@/lib/sales/notionExport";
import type { SourceRecord } from "@/lib/sales/notionSync";
import {
  applyNotionExport,
  applyNotionSync,
  previewNotionExport,
  previewNotionSync,
  type NotionSyncPreview,
  type NotionSyncResult,
  type NotionSyncState,
} from "@/lib/sales/notionSyncActions";
import type { PipelineStatus } from "@/lib/sales/types";
import { cn } from "@/lib/utils";

const stamp = new Intl.DateTimeFormat("de-DE", {
  timeZone: BUSINESS_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const MAX_ZIP_BYTES = 50 * 1024 * 1024;

/** ZIP (auch verschachtelt, wie Notion große Exporte packt) → Textdateien. */
function unzipExport(data: Uint8Array, depth = 0): ExportFile[] {
  const entries = unzipSync(data, {
    filter: (f) => /\.(csv|md|zip)$/i.test(f.name) && f.originalSize < 30 * 1024 * 1024,
  });
  const decoder = new TextDecoder("utf-8");
  const files: ExportFile[] = [];
  for (const [name, bytes] of Object.entries(entries)) {
    if (/\.zip$/i.test(name)) {
      if (depth < 2) files.push(...unzipExport(bytes, depth + 1));
    } else {
      files.push({ name, text: decoder.decode(bytes) });
    }
  }
  return files;
}

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

type Source = { kind: "api" } | { kind: "export"; records: SourceRecord[]; fileName: string; totalRows: number };

export function NotionSyncPanel({ state }: { state: NotionSyncState }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [preview, setPreview] = useState<NotionSyncPreview | null>(null);
  const [result, setResult] = useState<NotionSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, startLoad] = useTransition();
  const [applying, startApply] = useTransition();

  function runPreview(next: Source) {
    setError(null);
    setResult(null);
    setPreview(null);
    setSource(next);
    startLoad(async () => {
      const res = next.kind === "api" ? await previewNotionSync() : await previewNotionExport(next.records);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setPreview(res);
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setPreview(null);
    if (!/\.zip$/i.test(file.name)) {
      setError("Bitte die ZIP-Datei aus dem Notion-Export wählen.");
      return;
    }
    if (file.size > MAX_ZIP_BYTES) {
      setError("Die Datei ist größer als 50 MB. Bitte nur die Datenbank exportieren.");
      return;
    }
    try {
      const files = unzipExport(new Uint8Array(await file.arrayBuffer()));
      const parsed = parseNotionExport(files);
      if (parsed.records.length === 0) {
        setError("Im Export wurden keine Leads gefunden.");
        return;
      }
      runPreview({ kind: "export", records: parsed.records, fileName: file.name, totalRows: parsed.totalRows });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Datei konnte nicht gelesen werden.");
    }
  }

  function apply() {
    if (!source) return;
    setError(null);
    startApply(async () => {
      const res = source.kind === "api" ? await applyNotionSync() : await applyNotionExport(source.records);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setResult(res);
      setPreview(null);
      setSource(null);
      router.refresh();
    });
  }

  const busy = loading || applying;

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-5">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 text-[13px]">
            <div className="font-medium">ImmoScout Makler Leads · alle Leads mit ICP-Bewertung</div>
            <div className="text-xs text-fg-muted">
              {state.lastSync
                ? `Letzter Abgleich: Stand ${stamp.format(new Date(state.lastSync))}`
                : "Noch kein Abgleich. Der Import vom 26.11. gilt als Ausgangsstand."}
            </div>
          </div>
          {state.apiConfigured ? (
            <Button variant="secondary" onClick={() => runPreview({ kind: "api" })} disabled={busy}>
              <RefreshCw className={loading && source?.kind === "api" ? "animate-spin" : undefined} />
              Direkt aus Notion prüfen
            </Button>
          ) : null}
        </div>

        <div className="p-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void onFile(e.dataTransfer.files[0]);
            }}
            disabled={busy}
            className={cn(
              "flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
              dragging ? "border-accent bg-accent/5" : "border-line-strong hover:border-fg-subtle",
              busy && "opacity-60",
            )}
          >
            {loading && source?.kind === "export" ? (
              <RefreshCw className="size-6 animate-spin text-fg-muted" />
            ) : (
              <Upload className="size-6 text-fg-muted" />
            )}
            <span className="text-[13px] font-medium">
              {loading && source?.kind === "export" ? "Wird abgeglichen …" : "Notion-Export (.zip) hier ablegen oder auswählen"}
            </span>
            <span className="text-xs text-fg-muted">
              In Notion: Datenbank öffnen (Ansicht ohne Filter) → ⋯ → Exportieren → „Markdown &amp; CSV“, Unterseiten einschließen
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <div className="border-t border-line px-4 py-2.5 text-xs leading-relaxed text-fg-muted">
          Neue Leads werden angelegt, mit ICP-Bewertung (Grenzfall und nicht bewertet landen in „ICP prüfen“). „Kein
          Interesse“ und ICP raus werden ausgeschlossen, auch wenn es die Firma im CRM schon gibt, damit sie nie wieder
          kontaktiert werden. Bei bestehenden Leads werden sonst nur leere Felder gefüllt; der Status wird nur übernommen,
          solange der Lead im CRM noch „Neu“ ist. Abgleich über Notion-ID, IS24-Profil, Website, Telefon und Ansprechpartner.
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
              <div className="font-medium">Abgleich übernommen</div>
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

      {preview && source ? (
        <>
          {source.kind === "export" ? (
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <FileArchive className="size-3.5" />
              {source.fileName} · {source.totalRows} Zeilen im Export
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="neu anlegen" value={preview.counts.create} tone="text-accent-fg" />
            <Stat label="ergänzen" value={preview.counts.update} />
            <Stat
              label="Konflikte (nur Info)"
              value={preview.counts.conflicts}
              tone={preview.counts.conflicts ? "text-[var(--tone-amber-fg,currentColor)]" : undefined}
            />
            <Stat label="übersprungen" value={preview.counts.skipped} tone="text-fg-subtle" />
          </div>

          {preview.create.length ? (
            <Panel className="overflow-hidden">
              <PanelHeader title={`Neue Leads · ${preview.create.length}`} />
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {preview.create.map((c, i) => (
                  <li key={`${c.firma}-${i}`} className="flex items-center justify-between gap-3 px-4 py-1.5 text-[13px]">
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
                {preview.update.map((u, i) => (
                  <li key={`${u.firma}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-[13px]">
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
                In Notion nach dem letzten Abgleich geändert, im CRM aber schon bearbeitet. Der Abgleich ändert diese Leads
                nicht. Prüfe sie bei Bedarf selbst.
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
            {preview.counts.create === 0 && preview.counts.update === 0 ? (
              <span className="text-xs text-fg-muted">Alles auf dem neuesten Stand.</span>
            ) : null}
            <Button
              onClick={apply}
              disabled={applying || (preview.counts.create === 0 && preview.counts.update === 0)}
            >
              {applying ? "Wird übernommen …" : "Übernehmen"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
