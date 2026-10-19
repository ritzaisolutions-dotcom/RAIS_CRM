"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeTask,
  createTask,
  enrollInSequence,
  insertTouchpoint,
  sendCompanyEmail,
  sendCompanySms,
  stopSequenceEnrollment,
  voidTouchpoint,
} from "@/lib/sales/actions";
import { BUSINESS_TZ } from "@/lib/sales/dates";
import {
  ABBRUCH_OPTIONS,
  abbruchAllowed,
  ERGEBNIS_LABELS,
  ERGEBNIS_OPTIONS,
  KANAL_LABELS,
  TIMELINE_KANAL_OPTIONS,
  ergebnisTone,
} from "@/lib/sales/types";
import type {
  Abbruchgrund,
  EmailTemplate,
  Person,
  SalesTask,
  Sequence,
  SequenceEnrollment,
  TouchErgebnis,
  TouchKanal,
  Touchpoint,
} from "@/lib/sales/types";

type Tab = "timeline" | "email" | "sms" | "aufgaben" | "sequenzen";

export function CompanyTimeline({
  companyId,
  people,
  touchpoints,
  total,
  tasks,
  templates,
  sequences,
  enrollments,
  defaultEmail,
  defaultPhone,
}: {
  companyId: string;
  people: Person[];
  touchpoints: Touchpoint[];
  total: number;
  tasks: SalesTask[];
  templates: EmailTemplate[];
  sequences: Sequence[];
  enrollments: SequenceEnrollment[];
  defaultEmail: string | null;
  defaultPhone: string | null;
}) {
  const [tab, setTab] = useState<Tab>("timeline");

  return (
    <section className="dense-panel company-timeline">
      <h2 className="section-h">Timeline</h2>
      <p className="muted">
        Eine gemeinsame Historie für Call, E-Mail, SMS, Notiz und Aufgabe.
        Append-only — Fehleingaben stornieren, nicht löschen.
        {total > touchpoints.length
          ? ` Zeigt die letzten ${touchpoints.length} von ${total}.`
          : ""}
      </p>

      <div className="timeline-tabs" role="tablist" aria-label="Timeline">
        {(
          [
            ["timeline", "Eintrag"],
            ["email", "E-Mail"],
            ["sms", "SMS"],
            ["aufgaben", "Aufgaben"],
            ["sequenzen", "Sequenzen"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`btn${tab === id ? " btn-primary" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "timeline" ? (
        <TouchComposer
          companyId={companyId}
          people={people}
          touchpoints={touchpoints}
        />
      ) : null}
      {tab === "email" ? (
        <EmailComposer
          companyId={companyId}
          people={people}
          templates={templates}
          defaultEmail={defaultEmail}
        />
      ) : null}
      {tab === "sms" ? (
        <SmsComposer
          companyId={companyId}
          people={people}
          defaultPhone={defaultPhone}
        />
      ) : null}
      {tab === "aufgaben" ? (
        <TasksPanel companyId={companyId} people={people} tasks={tasks} />
      ) : null}
      {tab === "sequenzen" ? (
        <SequencesPanel
          companyId={companyId}
          people={people}
          sequences={sequences}
          enrollments={enrollments}
        />
      ) : null}
    </section>
  );
}

function TouchComposer({
  companyId,
  people,
  touchpoints,
}: {
  companyId: string;
  people: Person[];
  touchpoints: Touchpoint[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const entscheider = people.find((p) => p.ist_entscheider) ?? people[0];
  const [kanal, setKanal] = useState<TouchKanal>("call");
  const [ergebnis, setErgebnis] = useState<TouchErgebnis>("kein_ergebnis");
  const [abbruch, setAbbruch] = useState<Abbruchgrund | "">("");
  const [notiz, setNotiz] = useState("");
  const [next, setNext] = useState("");
  const [personId, setPersonId] = useState(entscheider?.id ?? "");

  useEffect(() => {
    if (entscheider?.id) setPersonId(entscheider.id);
  }, [entscheider?.id]);

  useEffect(() => {
    if (kanal === "note" || kanal === "task" || kanal === "sms") {
      setErgebnis("kein_ergebnis");
    }
  }, [kanal]);

  return (
    <>
      <form
        className="stack"
        style={{ marginTop: "0.85rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            if (kanal === "task") {
              if (!next) {
                setError("Aufgabe braucht ein Fälligkeitsdatum.");
                return;
              }
              const res = await createTask({
                company_id: companyId,
                person_id: personId || null,
                titel: notiz.trim() || "Aufgabe",
                notiz: null,
                due_on: next,
              });
              if (res.error) {
                setError(res.error);
                return;
              }
            } else {
              const res = await insertTouchpoint({
                company_id: companyId,
                person_id: personId || null,
                kanal,
                ergebnis,
                notiz: notiz || null,
                naechster_touch: next || null,
                abbruchgrund: abbruchAllowed(ergebnis)
                  ? (abbruch as Abbruchgrund) || null
                  : null,
              });
              if (res.error) {
                setError(res.error);
                return;
              }
            }
            setError(null);
            setNotiz("");
            setAbbruch("");
            router.refresh();
          });
        }}
      >
        <div className="grid-3">
          <div className="field">
            <label>Person</label>
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
            >
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.ist_entscheider ? " (E)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Kanal</label>
            <select
              value={kanal}
              onChange={(e) => setKanal(e.target.value as TouchKanal)}
            >
              {TIMELINE_KANAL_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {KANAL_LABELS[o]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Ergebnis</label>
            <select
              value={ergebnis}
              disabled={kanal === "note" || kanal === "task"}
              onChange={(e) => setErgebnis(e.target.value as TouchErgebnis)}
            >
              {ERGEBNIS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {ERGEBNIS_LABELS[o]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Abbruchgrund</label>
            <select
              value={abbruch}
              disabled={!abbruchAllowed(ergebnis)}
              onChange={(e) => setAbbruch(e.target.value as Abbruchgrund | "")}
            >
              <option value="">—</option>
              {ABBRUCH_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>
              {kanal === "task" ? "Fällig am" : "Nächster Touch"}
            </label>
            <input
              type="date"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required={kanal === "task"}
            />
          </div>
        </div>
        <div className="field">
          <label>{kanal === "task" ? "Aufgabentitel" : "Notiz"}</label>
          <textarea
            rows={3}
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            placeholder={
              kanal === "note"
                ? "Interne Notiz…"
                : kanal === "task"
                  ? "Was ist zu tun?"
                  : "Was wurde besprochen?"
            }
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Speichern
        </button>
      </form>

      <TimelineTable touchpoints={touchpoints} companyId={companyId} />
    </>
  );
}

function TimelineTable({
  touchpoints,
  companyId,
}: {
  touchpoints: Touchpoint[];
  companyId: string;
}) {
  return (
    <div className="table-wrap" style={{ marginTop: "1rem" }}>
      <table className="data">
        <thead>
          <tr>
            <th>Wann</th>
            <th>Kanal</th>
            <th>Ergebnis</th>
            <th>Notiz</th>
            <th>Nächster</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {touchpoints.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty">
                Noch keine Einträge
              </td>
            </tr>
          ) : (
            touchpoints.map((t) => (
              <TouchRow key={t.id} touch={t} companyId={companyId} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TouchRow({
  touch,
  companyId,
}: {
  touch: Touchpoint;
  companyId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const voided = Boolean(touch.voided_at);

  return (
    <tr className={voided ? "opacity-50" : undefined}>
      <td>
        {new Date(touch.occurred_at).toLocaleString("de-DE", {
          timeZone: BUSINESS_TZ,
        })}
      </td>
      <td>{KANAL_LABELS[touch.kanal] ?? touch.kanal}</td>
      <td>
        <span className="badge-tone" data-tone={ergebnisTone(touch.ergebnis)}>
          {ERGEBNIS_LABELS[touch.ergebnis]}
        </span>
        {voided ? " · storniert" : ""}
      </td>
      <td className="whitespace-pre-wrap">{touch.notiz}</td>
      <td>{touch.naechster_touch ?? "—"}</td>
      <td>
        {!voided ? (
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await voidTouchpoint(touch.id, companyId, "Fehleingabe");
                router.refresh();
              })
            }
          >
            Stornieren
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function EmailComposer({
  companyId,
  people,
  templates,
  defaultEmail,
}: {
  companyId: string;
  people: Person[];
  templates: EmailTemplate[];
  defaultEmail: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const entscheider = people.find((p) => p.ist_entscheider) ?? people[0];
  const [personId, setPersonId] = useState(entscheider?.id ?? "");
  const [to, setTo] = useState(defaultEmail ?? entscheider?.email ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("");

  return (
    <form
      className="stack"
      style={{ marginTop: "0.85rem" }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await sendCompanyEmail({
            company_id: companyId,
            person_id: personId || null,
            to_email: to,
            subject,
            body,
            template_id: templateId || null,
          });
          if (res.error) {
            setError(res.error);
            setMsg(null);
            return;
          }
          setError(null);
          setMsg("E-Mail in der Timeline gespeichert (Warteschlange).");
          setSubject("");
          setBody("");
          router.refresh();
        });
      }}
    >
      <div className="grid-3">
        <div className="field">
          <label>Vorlage</label>
          <select
            value={templateId}
            onChange={(e) => {
              const id = e.target.value;
              setTemplateId(id);
              const t = templates.find((x) => x.id === id);
              if (t) {
                setSubject(t.subject);
                setBody(t.body);
              }
            }}
          >
            <option value="">—</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Person</label>
          <select
            value={personId}
            onChange={(e) => {
              setPersonId(e.target.value);
              const p = people.find((x) => x.id === e.target.value);
              if (p?.email) setTo(p.email);
            }}
          >
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>An</label>
          <input
            type="email"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>Betreff</label>
        <input
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Text</label>
        <textarea
          rows={6}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      {msg ? <p className="muted">{msg}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        E-Mail speichern / senden
      </button>
    </form>
  );
}

function SmsComposer({
  companyId,
  people,
  defaultPhone,
}: {
  companyId: string;
  people: Person[];
  defaultPhone: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const entscheider = people.find((p) => p.ist_entscheider) ?? people[0];
  const [personId, setPersonId] = useState(entscheider?.id ?? "");
  const [phone, setPhone] = useState(
    defaultPhone ?? entscheider?.telefon ?? "",
  );
  const [body, setBody] = useState("");

  return (
    <form
      className="stack"
      style={{ marginTop: "0.85rem" }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await sendCompanySms({
            company_id: companyId,
            person_id: personId || null,
            to_phone: phone,
            body,
          });
          if (res.error) {
            setError(res.error);
            return;
          }
          setError(null);
          setBody("");
          router.refresh();
        });
      }}
    >
      <div className="grid-3">
        <div className="field">
          <label>Person</label>
          <select
            value={personId}
            onChange={(e) => {
              setPersonId(e.target.value);
              const p = people.find((x) => x.id === e.target.value);
              if (p?.telefon) setPhone(p.telefon);
            }}
          >
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Nummer</label>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>Nachricht</label>
        <textarea
          rows={3}
          required
          maxLength={1000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        SMS speichern / senden
      </button>
    </form>
  );
}

function TasksPanel({
  companyId,
  people,
  tasks,
}: {
  companyId: string;
  people: Person[];
  tasks: SalesTask[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [titel, setTitel] = useState("");
  const [due, setDue] = useState("");
  const [personId, setPersonId] = useState("");
  const open = tasks.filter((t) => t.status === "offen");

  return (
    <div className="stack" style={{ marginTop: "0.85rem" }}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createTask({
              company_id: companyId,
              titel,
              due_on: due,
              person_id: personId || null,
            });
            if (res.error) {
              setError(res.error);
              return;
            }
            setError(null);
            setTitel("");
            router.refresh();
          });
        }}
      >
        <div className="grid-3">
          <div className="field">
            <label>Aufgabe</label>
            <input
              required
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Fällig</label>
            <input
              type="date"
              required
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Person</label>
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
            >
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Aufgabe anlegen
        </button>
      </form>

      <ul className="task-list">
        {open.length === 0 ? (
          <li className="muted">Keine offenen Aufgaben</li>
        ) : (
          open.map((t) => (
            <li key={t.id} className="task-item">
              <div>
                <strong>{t.titel}</strong>
                <div className="muted">fällig {t.due_on}</div>
              </div>
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await completeTask(t.id, companyId);
                    router.refresh();
                  })
                }
              >
                Erledigt
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function SequencesPanel({
  companyId,
  people,
  sequences,
  enrollments,
}: {
  companyId: string;
  people: Person[];
  sequences: Sequence[];
  enrollments: SequenceEnrollment[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sequenceId, setSequenceId] = useState(sequences[0]?.id ?? "");
  const [personId, setPersonId] = useState("");
  const active = enrollments.filter((e) => e.status === "aktiv");

  return (
    <div className="stack" style={{ marginTop: "0.85rem" }}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!sequenceId) return;
          start(async () => {
            const res = await enrollInSequence({
              sequence_id: sequenceId,
              company_id: companyId,
              person_id: personId || null,
            });
            if (res.error) {
              setError(res.error);
              return;
            }
            setError(null);
            router.refresh();
          });
        }}
      >
        <div className="grid-3">
          <div className="field">
            <label>Sequenz</label>
            <select
              value={sequenceId}
              onChange={(e) => setSequenceId(e.target.value)}
            >
              {sequences.length === 0 ? (
                <option value="">Keine Sequenz angelegt</option>
              ) : (
                sequences
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
              )}
            </select>
          </div>
          <div className="field">
            <label>Person</label>
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
            >
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button
          className="btn btn-primary"
          type="submit"
          disabled={pending || !sequenceId}
        >
          In Sequenz einschreiben
        </button>
      </form>

      <ul className="task-list">
        {active.length === 0 ? (
          <li className="muted">Keine aktive Sequenz</li>
        ) : (
          active.map((e) => (
            <li key={e.id} className="task-item">
              <div>
                <strong>
                  {sequences.find((s) => s.id === e.sequence_id)?.name ??
                    "Sequenz"}
                </strong>
                <div className="muted">
                  Schritt {e.current_step} · nächster Lauf{" "}
                  {e.next_run_on ?? "—"}
                </div>
              </div>
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await stopSequenceEnrollment(e.id, companyId);
                    router.refresh();
                  })
                }
              >
                Stoppen
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
