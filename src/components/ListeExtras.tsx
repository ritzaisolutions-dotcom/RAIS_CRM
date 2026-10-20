"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addBusinessDays,
  businessToday,
} from "@/lib/sales/dates";
import {
  bulkCreateFollowUpTasks,
  bulkEnrollInSequence,
  bulkSetPipelineStatus,
  completeTask,
  deleteSavedView,
  importCompanies,
  logClickToCall,
  upsertSavedView,
} from "@/lib/sales/actions";
import { parseCompanyImportCsv } from "@/lib/sales/csvImport";
import { placeCallHref } from "@/lib/sales/placeCall";
import {
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUS_OPTIONS,
} from "@/lib/sales/types";
import type {
  CallListeRow,
  LeadList,
  PipelineStatus,
  SalesTask,
  Sequence,
} from "@/lib/sales/types";
import type { SavedViewWithCount } from "@/lib/sales/queries";

export function ListeDialer({
  rows,
  dialerHref,
}: {
  rows: CallListeRow[];
  dialerHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [index, setIndex] = useState(0);
  const withPhone = useMemo(
    () => rows.filter((r) => Boolean(r.tel)),
    [rows],
  );
  const current = withPhone[index] ?? null;

  return (
    <section className="dense-panel dialer-panel">
      <div className="form-actions wrap" style={{ justifyContent: "space-between" }}>
        <h2 className="section-h" style={{ margin: 0 }}>
          Dialer
        </h2>
        <Link href={dialerHref} className="btn btn-primary">
          Session starten
        </Link>
      </div>
      {!current ? (
        <p className="muted">Keine Telefonnummer auf dieser Seite.</p>
      ) : (
        <>
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
              href={placeCallHref(current.tel!)}
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
        </>
      )}
    </section>
  );
}

export function OpenTasksStrip({ tasks }: { tasks: SalesTask[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = businessToday();
  const due = tasks.filter((t) => t.due_on <= today).slice(0, 8);
  if (!due.length) {
    return (
      <section className="dense-panel">
        <div className="form-actions wrap" style={{ justifyContent: "space-between" }}>
          <h2 className="section-h" style={{ margin: 0 }}>
            Nächste Aktionen
          </h2>
          <a href="/todos" className="btn">
            Alle Todos →
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="dense-panel">
      <div className="form-actions wrap" style={{ justifyContent: "space-between" }}>
        <h2 className="section-h" style={{ margin: 0 }}>
          Nächste Aktionen
        </h2>
        <a href="/todos" className="btn">
          Alle Todos →
        </a>
      </div>
      <ul className="task-list" style={{ marginTop: "0.65rem" }}>
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
  sequences = [],
  desk = "dialen",
}: {
  selectedIds: string[];
  onClear: () => void;
  sequences?: Sequence[];
  desk?: "dialen" | "termine" | "kunden";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<PipelineStatus>(
    desk === "termine" ? "kunde" : "callback",
  );
  const [sequenceId, setSequenceId] = useState(sequences[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  if (!selectedIds.length) return null;

  const dueIn2 = addBusinessDays(businessToday(), 2);
  const statusOptions =
    desk === "termine"
      ? (["set_appointment", "callback", "kunde", "disqualified"] as const)
      : desk === "kunden"
        ? (["callback", "kunde", "disqualified"] as const)
        : PIPELINE_STATUS_OPTIONS;

  function applyStatus(next: PipelineStatus, label: string) {
    start(async () => {
      const res = await bulkSetPipelineStatus({
        companyIds: selectedIds,
        pipelineStatus: next,
        kanal: "status_change",
        naechsterTouch: dueIn2,
      });
      if (res.error) setMsg(res.error);
      else {
        setMsg(`${res.updated} ${label}`);
        onClear();
        router.refresh();
      }
    });
  }

  return (
    <div className="dense-panel bulk-bar">
      <span>{selectedIds.length} ausgewählt</span>
      {desk === "dialen" ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => applyStatus("set_appointment", "→ Termine")}
        >
          → Termine
        </button>
      ) : null}
      {desk === "termine" ? (
        <>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => applyStatus("kunde", "→ Kunden")}
          >
            → Kunde
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => applyStatus("callback", "→ Dialen")}
          >
            Zurück Dialen
          </button>
        </>
      ) : null}
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as PipelineStatus)}
      >
        {statusOptions.map((s) => (
          <option key={s} value={s}>
            {PIPELINE_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() =>
          applyStatus(
            status,
            status === "set_appointment"
              ? "→ Termine"
              : status === "kunde"
                ? "→ Kunden"
                : "aktualisiert",
          )
        }
      >
        Status setzen
      </button>
      {sequences.length > 0 ? (
        <>
          <select
            value={sequenceId}
            onChange={(e) => setSequenceId(e.target.value)}
          >
            {sequences
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={pending || !sequenceId}
            onClick={() =>
              start(async () => {
                const res = await bulkEnrollInSequence({
                  companyIds: selectedIds,
                  sequence_id: sequenceId,
                });
                if (res.error) setMsg(res.error);
                else {
                  setMsg(`${res.enrolled} eingeschrieben`);
                  onClear();
                  router.refresh();
                }
              })
            }
          >
            Sequenz
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await bulkCreateFollowUpTasks({
              companyIds: selectedIds,
              titel: "Follow-up (Bulk)",
              due_on: dueIn2,
            });
            if (res.error) setMsg(res.error);
            else {
              setMsg(`${res.created} Aufgaben (+2 Werktage)`);
              onClear();
              router.refresh();
            }
          })
        }
      >
        Follow-up
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
  views: SavedViewWithCount[];
  current: { status: string; due: string; q: string; sort: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");

  const dialParams = new URLSearchParams();
  if (current.status) dialParams.set("status", current.status);
  if (current.due) dialParams.set("due", current.due);
  if (current.q) dialParams.set("q", current.q);
  if (current.sort) dialParams.set("sort", current.sort);

  return (
    <div className="saved-views-bar">
      <div className="form-actions wrap">
        {views.map((v) => {
          const params = new URLSearchParams();
          if (v.filters.status) params.set("status", v.filters.status);
          if (v.filters.due) params.set("due", v.filters.due);
          if (v.filters.q) params.set("q", v.filters.q);
          if (v.filters.sort) params.set("sort", v.filters.sort);
          const qs = params.toString();
          return (
            <span key={v.id} className="form-actions wrap">
              <a className="btn" href={`/liste?${qs}`}>
                {v.name} ({v.count})
              </a>
              <a
                className="btn"
                href={`/liste/dialen?${qs}`}
                title="Im Power-Dialer abarbeiten"
                aria-label={`${v.name} im Power-Dialer abarbeiten`}
              >
                ▶
              </a>
              <button
                type="button"
                className="btn"
                disabled={pending}
                title="Ansicht löschen"
                aria-label={`Ansicht ${v.name} löschen`}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Gespeicherte Ansicht „${v.name}“ wirklich löschen?`,
                    )
                  ) {
                    return;
                  }
                  start(async () => {
                    await deleteSavedView(v.id);
                    router.refresh();
                  });
                }}
              >
                ×
              </button>
            </span>
          );
        })}
        <Link
          href={`/liste/dialen?${dialParams.toString()}`}
          className="btn"
          title="Aktuelle Filter im Power-Dialer"
        >
          Filter im Dialer
        </Link>
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
        <label className="sr-only" htmlFor="saved-view-name">
          Ansicht speichern
        </label>
        <input
          id="saved-view-name"
          placeholder="Ansicht speichern…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Name der gespeicherten Ansicht"
        />
        <button className="btn" type="submit" disabled={pending}>
          Speichern
        </button>
      </form>
    </div>
  );
}

export function ImportCompaniesPanel({
  lists = [],
  defaultListId = "",
  onDone,
}: {
  lists?: LeadList[];
  /** Preselect membership list (e.g. current Dialen list filter). */
  defaultListId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [raw, setRaw] = useState(
    "name,stadt,telefon,website,email,person_name\n",
  );
  const [listId, setListId] = useState(defaultListId);
  const [listName, setListName] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function runImport(csvText: string) {
    start(async () => {
      const parsed = parseCompanyImportCsv(csvText);
      if (parsed.error) {
        setResult(parsed.error);
        return;
      }
      if (parsed.rows.length > 200) {
        setResult("Maximal 200 Zeilen pro Import.");
        return;
      }
      const res = await importCompanies({
        rows: parsed.rows,
        listId: listId || null,
        listName: !listId && listName.trim() ? listName.trim() : null,
      });
      if (!res.ok) {
        setResult(res.error);
        return;
      }
      const listHint = res.listId
        ? " · in Mitgliedschaftsliste übernommen"
        : "";
      setResult(
        `${res.created} angelegt${listHint}` +
          (res.errors.length
            ? ` · ${res.errors.length} Fehler: ${res.errors.slice(0, 3).join("; ")}`
            : ""),
      );
      router.refresh();
    });
  }

  return (
    <section className="dense-panel" id="csv-import">
      <h2 className="section-h">CSV-Import (Lead-Batch)</h2>
      <p className="muted">
        Header: name/Firma, stadt, telefon/Telefon, website, email/E-Mail,
        person_name/Entscheider. Komma oder Semikolon. Max. 200 Zeilen.
        Optional in eine Mitgliedschaftsliste legen.
      </p>

      <div className="form-actions wrap items-end gap-3">
        <label className="stack gap-1">
          <span className="text-xs font-medium">CSV-Datei</span>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="text-sm"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setFileName(file.name);
              const reader = new FileReader();
              reader.onload = () => {
                const text = String(reader.result ?? "");
                setRaw(text);
              };
              reader.readAsText(file, "UTF-8");
              e.target.value = "";
            }}
          />
          {fileName ? (
            <span className="muted text-xs">{fileName}</span>
          ) : null}
        </label>

        <label className="stack gap-1">
          <span className="text-xs font-medium">Bestehende Liste</span>
          <select
            value={listId}
            onChange={(e) => {
              setListId(e.target.value);
              if (e.target.value) setListName("");
            }}
            className="h-9 min-w-[12rem] rounded-md border border-rais-border bg-white px-2 text-sm"
            disabled={pending}
          >
            <option value="">— keine —</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {typeof l.member_count === "number"
                  ? ` (${l.member_count})`
                  : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="stack gap-1">
          <span className="text-xs font-medium">oder neue Batch-Liste</span>
          <input
            type="text"
            value={listName}
            onChange={(e) => {
              setListName(e.target.value);
              if (e.target.value.trim()) setListId("");
            }}
            placeholder="z. B. ImmoScout KW42"
            className="h-9 min-w-[12rem] rounded-md border border-rais-border bg-white px-2 text-sm"
            disabled={pending || Boolean(listId)}
            maxLength={80}
          />
        </label>
      </div>

      <textarea
        rows={8}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className="mt-3 w-full font-mono text-sm"
        aria-label="CSV-Inhalt"
      />
      <div className="form-actions wrap mt-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => runImport(raw)}
        >
          {pending ? "Import läuft…" : "Import starten"}
        </button>
        {onDone ? (
          <button type="button" className="btn" onClick={onDone}>
            Schließen
          </button>
        ) : null}
      </div>
      {result ? <p className="muted mt-2">{result}</p> : null}
    </section>
  );
}
