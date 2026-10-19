"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkSetPipelineStatus,
  completeTask,
  importCompanies,
  logClickToCall,
  upsertSavedView,
} from "@/lib/sales/actions";
import { businessToday } from "@/lib/sales/dates";
import {
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUS_OPTIONS,
} from "@/lib/sales/types";
import type {
  CallListeRow,
  PipelineStatus,
  SalesTask,
  SavedView,
} from "@/lib/sales/types";

export function ListeDialer({ rows }: { rows: CallListeRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [index, setIndex] = useState(0);
  const withPhone = useMemo(
    () => rows.filter((r) => Boolean(r.tel)),
    [rows],
  );
  const current = withPhone[index] ?? null;

  if (!current) {
    return (
      <section className="dense-panel dialer-panel">
        <h2 className="section-h">Dialer</h2>
        <p className="muted">Keine Telefonnummer auf dieser Seite.</p>
      </section>
    );
  }

  return (
    <section className="dense-panel dialer-panel">
      <h2 className="section-h">Dialer</h2>
      <p className="mb-1">
        <strong>{current.firma}</strong>
        {current.entscheider ? ` · ${current.entscheider}` : ""}
      </p>
      <p className="muted mb-2">
        {index + 1} / {withPhone.length} · {current.tel}
      </p>
      <div className="form-actions wrap">
        <a
          className="btn btn-primary"
          href={`tel:${current.tel!.replace(/\s+/g, "")}`}
          onClick={() =>
            start(async () => {
              await logClickToCall({
                company_id: current.company_id,
                telefon: current.tel!,
              });
              router.refresh();
            })
          }
        >
          {pending ? "…" : "Anrufen"}
        </a>
        <button
          type="button"
          className="btn"
          disabled={index <= 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          Zurück
        </button>
        <button
          type="button"
          className="btn"
          disabled={index >= withPhone.length - 1}
          onClick={() =>
            setIndex((i) => Math.min(withPhone.length - 1, i + 1))
          }
        >
          Nächste
        </button>
      </div>
    </section>
  );
}

export function OpenTasksStrip({ tasks }: { tasks: SalesTask[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = businessToday();
  const due = tasks.filter((t) => t.due_on <= today).slice(0, 8);
  if (!due.length) return null;

  return (
    <section className="dense-panel">
      <h2 className="section-h">Nächste Aktionen</h2>
      <ul className="task-list">
        {due.map((t) => (
          <li key={t.id} className="task-item">
            <div>
              <a href={`/firma/${t.company_id}`}>
                <strong>{t.firma ?? "Firma"}</strong>
              </a>
              <div>
                {t.titel} · fällig {t.due_on}
                {t.due_on < today ? " (überfällig)" : ""}
              </div>
            </div>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await completeTask(t.id, t.company_id);
                  router.refresh();
                })
              }
            >
              Erledigt
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BulkPipelineBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<PipelineStatus>("callback");
  const [msg, setMsg] = useState<string | null>(null);

  if (!selectedIds.length) return null;

  return (
    <div className="dense-panel bulk-bar">
      <span>{selectedIds.length} ausgewählt</span>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as PipelineStatus)}
      >
        {PIPELINE_STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {PIPELINE_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await bulkSetPipelineStatus({
              companyIds: selectedIds,
              pipelineStatus: status,
            });
            if (res.error) setMsg(res.error);
            else {
              setMsg(`${res.updated} aktualisiert`);
              onClear();
              router.refresh();
            }
          })
        }
      >
        Status setzen
      </button>
      <button type="button" className="btn" onClick={onClear}>
        Auswahl leeren
      </button>
      {msg ? <span className="muted">{msg}</span> : null}
    </div>
  );
}

export function SavedViewsBar({
  views,
  current,
}: {
  views: SavedView[];
  current: { status: string; due: string; q: string; sort: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");

  return (
    <div className="saved-views-bar">
      <div className="form-actions wrap">
        {views.map((v) => {
          const params = new URLSearchParams();
          if (v.filters.status) params.set("status", v.filters.status);
          if (v.filters.due) params.set("due", v.filters.due);
          if (v.filters.q) params.set("q", v.filters.q);
          if (v.filters.sort) params.set("sort", v.filters.sort);
          return (
            <a key={v.id} className="btn" href={`/liste?${params.toString()}`}>
              {v.name}
            </a>
          );
        })}
      </div>
      <form
        className="form-actions wrap"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          start(async () => {
            await upsertSavedView({
              name: name.trim(),
              scope: "liste",
              filters: {
                status: current.status || undefined,
                due: current.due || undefined,
                q: current.q || undefined,
                sort: current.sort || undefined,
              },
            });
            setName("");
            router.refresh();
          });
        }}
      >
        <input
          placeholder="Ansicht speichern…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" type="submit" disabled={pending}>
          Speichern
        </button>
      </form>
    </div>
  );
}

export function ImportCompaniesPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [raw, setRaw] = useState(
    "name,stadt,telefon,website,email,person_name\n",
  );
  const [result, setResult] = useState<string | null>(null);

  return (
    <section className="dense-panel">
      <h2 className="section-h">Import (CSV)</h2>
      <p className="muted">
        Spalten: name, stadt, telefon, website, email, person_name. Max. 200
        Zeilen. Läuft über create_company.
      </p>
      <textarea
        rows={8}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className="w-full font-mono text-sm"
      />
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const lines = raw
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean);
            if (lines.length < 2) {
              setResult("Header + mindestens eine Zeile nötig.");
              return;
            }
            const headers = lines[0].split(",").map((h) => h.trim());
            const rows = lines.slice(1).map((line) => {
              const cols = line.split(",").map((c) => c.trim());
              const obj: Record<string, string> = {};
              headers.forEach((h, i) => {
                obj[h] = cols[i] ?? "";
              });
              return {
                name: obj.name ?? "",
                stadt: obj.stadt || null,
                telefon: obj.telefon || null,
                website: obj.website || null,
                email: obj.email || null,
                person_name: obj.person_name || null,
              };
            });
            const res = await importCompanies(rows);
            if (!res.ok) {
              setResult(res.error);
              return;
            }
            setResult(
              `${res.created} angelegt` +
                (res.errors.length
                  ? ` · ${res.errors.length} Fehler: ${res.errors.slice(0, 3).join("; ")}`
                  : ""),
            );
            router.refresh();
          })
        }
      >
        Import starten
      </button>
      {result ? <p className="muted">{result}</p> : null}
    </section>
  );
}
