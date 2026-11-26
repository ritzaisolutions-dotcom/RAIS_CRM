"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, FileSpreadsheet, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { upsertLeadList } from "@/lib/sales/actions";
import { importLeadsChunk } from "@/lib/sales/leadActions";
import {
  IMPORT_FIELDS,
  ISSUE_LABELS,
  parseCsvTable,
  prepareRows,
  suggestMapping,
  type ImportMapping,
  type ParsedTable,
} from "@/lib/sales/leadImport";
import {
  LEAD_QUELLEN,
  LEAD_QUELLE_LABELS,
  type ImportLeadResult,
  type LeadList,
  type LeadQuelle,
} from "@/lib/sales/types";
import { cn } from "@/lib/utils";

const CHUNK = 200;
const MAX_ROWS = 2000;

type Step = 1 | 2 | 3 | 4;

function Steps({ step }: { step: Step }) {
  const items = ["Datei", "Spalten zuordnen", "Prüfen", "Fertig"];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {items.map((label, i) => {
        const n = (i + 1) as Step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                n < step && "bg-[var(--tone-green-bg)] text-[var(--tone-green-fg)]",
                n === step && "bg-accent text-white",
                n > step && "bg-surface-3 text-fg-subtle",
              )}
            >
              {n}
            </span>
            <span className={cn(n === step ? "font-medium text-fg" : "text-fg-muted")}>{label}</span>
            {i < items.length - 1 ? <span className="h-px w-6 bg-line-strong" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function ImportWizard({ lists }: { lists: LeadList[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [defaultQuelle, setDefaultQuelle] = useState<LeadQuelle>("manuell");
  const [listMode, setListMode] = useState<"none" | "existing" | "new">("none");
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [newListName, setNewListName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<ImportLeadResult[]>([]);
  const [pending, start] = useTransition();

  function loadText(text: string, name?: string) {
    setRaw(text);
    if (name) setFileName(name);
    setError(null);
  }

  function goMapping() {
    const parsed = parseCsvTable(raw);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    if (parsed.rows.length > MAX_ROWS) {
      setError(`Maximal ${MAX_ROWS} Zeilen pro Import — die Datei hat ${parsed.rows.length}. Bitte aufteilen.`);
      return;
    }
    setTable(parsed);
    setMapping(suggestMapping(parsed.headers));
    setError(null);
    setStep(2);
  }

  const prepared = useMemo(
    () => (table ? prepareRows(table, mapping) : []),
    [table, mapping],
  );
  const importable = prepared.filter((p) => p.issues.length === 0);
  const skipped = prepared.length - importable.length;
  const nameMapped = Object.values(mapping).includes("name");

  function setColumn(col: number, key: string) {
    setMapping((m) => {
      const next: ImportMapping = { ...m };
      // Ein Feld nur einer Spalte zuordnen.
      if (key) {
        for (const [c, k] of Object.entries(next)) if (k === key) next[Number(c)] = "";
      }
      next[col] = key as ImportMapping[number];
      return next;
    });
  }

  function runImport() {
    start(async () => {
      setError(null);
      let targetList: string | null = null;
      if (listMode === "existing" && listId) targetList = listId;
      if (listMode === "new" && newListName.trim()) {
        const res = await upsertLeadList({ name: newListName.trim() });
        if (res.error || !res.ok) {
          setError(res.error ?? "Liste konnte nicht angelegt werden.");
          return;
        }
        targetList = res.listId;
      }

      const rows = importable.map((p) => p.row);
      const all: ImportLeadResult[] = [];
      setProgress({ done: 0, total: rows.length });
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const res = await importLeadsChunk({ rows: chunk, listId: targetList, defaultQuelle });
        if (res.error) {
          setError(`Abbruch bei Zeile ${i + 1}: ${res.error}`);
          break;
        }
        all.push(...(res.results ?? []).map((r) => ({ ...r, index: r.index + i })));
        setProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length });
      }
      setResults(all);
      setStep(4);
      router.refresh();
    });
  }

  const created = results.filter((r) => r.status === "created").length;
  const dupes = results.filter((r) => r.status === "duplicate").length;
  const failed = results.filter((r) => r.status === "error");

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-5">
      <Steps step={step} />

      {step === 1 ? (
        <Panel>
          <PanelHeader
            title="CSV-Datei wählen"
            description="Export aus Notion, Excel oder Google Sheets. Komma, Semikolon oder Tab werden erkannt."
          />
          <div className="grid gap-4 p-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) f.text().then((t) => loadText(t, f.name));
              }}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface-2/40 px-6 py-10 text-center transition-colors hover:border-fg-subtle hover:bg-surface-2"
            >
              <Upload className="size-5 text-fg-muted" />
              <span className="text-[13px] font-medium">
                {fileName ? fileName : "CSV hierher ziehen oder klicken"}
              </span>
              <span className="text-xs text-fg-subtle">
                Erste Zeile = Spaltennamen · bis {MAX_ROWS} Zeilen
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) f.text().then((t) => loadText(t, f.name));
              }}
            />
            <details>
              <summary className="cursor-pointer text-xs text-fg-muted hover:text-fg">
                …oder Inhalt einfügen
              </summary>
              <Textarea
                rows={6}
                value={raw}
                onChange={(e) => loadText(e.target.value)}
                placeholder={"Firma;Stadt;Ansprechpartner;E-Mail\nBecker Immobilien;Leipzig;Anna Becker;anna@becker.de"}
                className="mt-2 font-mono text-xs"
              />
            </details>
            {error ? <p className="text-[13px] text-[var(--tone-red-fg)]">{error}</p> : null}
            <div className="flex justify-end">
              <Button size="sm" disabled={!raw.trim()} onClick={goMapping}>
                Weiter
                <ArrowRight />
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      {step === 2 && table ? (
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Spalten zuordnen"
            description={`${table.rows.length} Zeilen · Vorschläge sind schon gesetzt, bitte prüfen.`}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-[11.5px] text-fg-muted">
                  <th className="px-4 py-2 font-medium">Spalte in der Datei</th>
                  <th className="px-4 py-2 font-medium">Beispiel</th>
                  <th className="w-56 px-4 py-2 font-medium">Feld im CRM</th>
                </tr>
              </thead>
              <tbody>
                {table.headers.map((h, i) => {
                  const sample = table.rows.find((r) => r[i]?.trim())?.[i] ?? "";
                  return (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-4 py-1.5 font-medium">{h || `Spalte ${i + 1}`}</td>
                      <td className="max-w-xs truncate px-4 py-1.5 text-fg-muted">{sample || "—"}</td>
                      <td className="px-4 py-1.5">
                        <NativeSelect
                          value={mapping[i] ?? ""}
                          onChange={(e) => setColumn(i, e.target.value)}
                          className={cn(!mapping[i] && "text-fg-subtle")}
                        >
                          <option value="">Nicht importieren</option>
                          {IMPORT_FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                              {"required" in f && f.required ? " *" : ""}
                            </option>
                          ))}
                        </NativeSelect>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
            <Field
              label="Quelle für alle Zeilen"
              htmlFor="imp-quelle"
              hint="Gilt, wenn die Datei keine (erkennbare) Quelle-Spalte hat."
            >
              <NativeSelect
                id="imp-quelle"
                value={defaultQuelle}
                onChange={(e) => setDefaultQuelle(e.target.value as LeadQuelle)}
              >
                {LEAD_QUELLEN.map((q) => (
                  <option key={q} value={q}>
                    {LEAD_QUELLE_LABELS[q]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Zu Liste hinzufügen" htmlFor="imp-list">
              <div className="flex gap-2">
                <NativeSelect
                  id="imp-list"
                  value={listMode}
                  onChange={(e) => setListMode(e.target.value as typeof listMode)}
                  className="w-40 shrink-0"
                >
                  <option value="none">Keine Liste</option>
                  {lists.length > 0 ? <option value="existing">Bestehende</option> : null}
                  <option value="new">Neue Liste</option>
                </NativeSelect>
                {listMode === "existing" ? (
                  <NativeSelect value={listId} onChange={(e) => setListId(e.target.value)}>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </NativeSelect>
                ) : null}
                {listMode === "new" ? (
                  <Input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="z. B. IS24 Leipzig Nov"
                  />
                ) : null}
              </div>
            </Field>
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              <ArrowLeft />
              Zurück
            </Button>
            <div className="flex items-center gap-3">
              {!nameMapped ? (
                <span className="text-xs text-[var(--tone-red-fg)]">Bitte die Spalte für „Firma“ zuordnen.</span>
              ) : null}
              <Button size="sm" disabled={!nameMapped} onClick={() => setStep(3)}>
                Weiter
                <ArrowRight />
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      {step === 3 && table ? (
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Prüfen"
            description="Dubletten gegen bestehende Leads (gleiche E-Mail oder Firma + Stadt) werden beim Import übersprungen."
          />
          <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2.5">
            <Badge tone="green">{importable.length} bereit</Badge>
            {skipped > 0 ? <Badge tone="yellow">{skipped} mit Problem — werden übersprungen</Badge> : null}
          </div>
          <div className="max-h-[50vh] overflow-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-fg-muted">
                  {["#", "Firma", "Stadt", "Ansprechpartner", "E-Mail", "Quelle", "Prüfung"].map((h) => (
                    <th key={h} className="sticky top-0 border-b border-line bg-surface-2 px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prepared.slice(0, 300).map((p) => (
                  <tr key={p.index} className={cn("border-b border-line", p.issues.length && "bg-[var(--tone-yellow-bg)]/40")}>
                    <td className="px-3 py-1.5 text-fg-subtle tabular-nums">{p.index + 1}</td>
                    <td className="max-w-[14rem] truncate px-3 py-1.5 font-medium">{p.row.name || "—"}</td>
                    <td className="px-3 py-1.5 text-fg-muted">{p.row.stadt ?? "—"}</td>
                    <td className="max-w-[10rem] truncate px-3 py-1.5">{p.row.person_name ?? "—"}</td>
                    <td className="max-w-[14rem] truncate px-3 py-1.5 text-fg-muted">{p.row.email ?? "—"}</td>
                    <td className="px-3 py-1.5 text-fg-muted">{p.row.quelle ?? LEAD_QUELLE_LABELS[defaultQuelle]}</td>
                    <td className="px-3 py-1.5">
                      {p.issues.length === 0 ? (
                        <CircleCheck className="size-4 text-[var(--tone-green-fg)]" />
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-[var(--tone-yellow-fg)]">
                          <CircleAlert className="size-3.5" />
                          {p.issues.map((i) => ISSUE_LABELS[i]).join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {prepared.length > 300 ? (
              <p className="px-4 py-2 text-xs text-fg-subtle">Vorschau zeigt die ersten 300 von {prepared.length} Zeilen.</p>
            ) : null}
          </div>
          {error ? <p className="border-t border-line px-4 py-2 text-[13px] text-[var(--tone-red-fg)]">{error}</p> : null}
          <div className="flex items-center justify-between border-t border-line px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => setStep(2)} disabled={pending}>
              <ArrowLeft />
              Zurück
            </Button>
            <div className="flex items-center gap-3">
              {progress ? (
                <span className="text-xs tabular-nums text-fg-muted">
                  {progress.done} / {progress.total}
                </span>
              ) : null}
              <Button size="sm" disabled={pending || importable.length === 0} onClick={runImport}>
                <FileSpreadsheet />
                {pending ? "Importiere…" : `${importable.length} Leads importieren`}
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      {step === 4 ? (
        <Panel>
          <PanelHeader title="Import abgeschlossen" />
          <div className="grid gap-4 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-line p-3">
                <div className="text-xs text-fg-muted">Neu angelegt</div>
                <div className="text-xl font-semibold tabular-nums text-[var(--tone-green-fg)]">{created}</div>
              </div>
              <div className="rounded-md border border-line p-3">
                <div className="text-xs text-fg-muted">Schon vorhanden (übersprungen)</div>
                <div className="text-xl font-semibold tabular-nums">{dupes}</div>
              </div>
              <div className="rounded-md border border-line p-3">
                <div className="text-xs text-fg-muted">Fehler</div>
                <div className={cn("text-xl font-semibold tabular-nums", failed.length && "text-[var(--tone-red-fg)]")}>
                  {failed.length + skipped}
                </div>
              </div>
            </div>
            {failed.length > 0 ? (
              <ul className="space-y-1 text-xs text-[var(--tone-red-fg)]">
                {failed.slice(0, 20).map((f) => (
                  <li key={f.index}>
                    Zeile {(importable[f.index]?.index ?? f.index) + 1}: {f.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {error ? <p className="text-[13px] text-[var(--tone-red-fg)]">{error}</p> : null}
            <div className="flex gap-2">
              <Button size="sm" asChild>
                <Link href="/leads?view=neu&sort=neueste">Neue Leads ansehen</Link>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setStep(1);
                  setRaw("");
                  setFileName(null);
                  setTable(null);
                  setResults([]);
                  setProgress(null);
                  setError(null);
                }}
              >
                Weitere Datei importieren
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
