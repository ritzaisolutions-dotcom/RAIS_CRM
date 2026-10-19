"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteEmailTemplate,
  deleteWorkflowRule,
  runDueSequenceSteps,
  upsertEmailTemplate,
  upsertSequence,
  upsertSequenceStep,
  upsertWorkflowRule,
} from "@/lib/sales/actions";
import {
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUS_OPTIONS,
} from "@/lib/sales/types";
import type {
  EmailTemplate,
  PipelineStatus,
  Sequence,
  SequenceStep,
  WorkflowRule,
} from "@/lib/sales/types";

export function EmailTemplatesPanel({
  templates,
}: {
  templates: EmailTemplate[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="dense-panel">
      <h2 className="section-h">E-Mail-Vorlagen</h2>
      <ul className="task-list">
        {templates.map((t) => (
          <li key={t.id} className="task-item">
            <div>
              <strong>{t.name}</strong>
              <div className="muted">{t.subject}</div>
            </div>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await deleteEmailTemplate(t.id);
                  router.refresh();
                })
              }
            >
              Löschen
            </button>
          </li>
        ))}
      </ul>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await upsertEmailTemplate({ name, subject, body });
            if (res.error) setError(res.error);
            else {
              setError(null);
              setName("");
              setSubject("");
              setBody("");
              router.refresh();
            }
          });
        }}
      >
        <div className="field">
          <label>Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
            rows={4}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Vorlage speichern
        </button>
      </form>
    </section>
  );
}

export function SequencesPanel({
  sequences,
  stepsBySequence,
}: {
  sequences: Sequence[];
  stepsBySequence: Record<string, SequenceStep[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [sequenceId, setSequenceId] = useState(sequences[0]?.id ?? "");
  const [kanal, setKanal] = useState<"email" | "call" | "sms" | "task">(
    "email",
  );
  const [order, setOrder] = useState("1");
  const [delay, setDelay] = useState("1");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [taskTitel, setTaskTitel] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="dense-panel">
      <h2 className="section-h">Sequenzen</h2>
      <div className="form-actions wrap" style={{ marginBottom: "0.75rem" }}>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await runDueSequenceSteps();
              if (!res.ok) setError(res.error);
              else {
                setError(null);
                router.refresh();
              }
            })
          }
        >
          Fällige Schritte jetzt ausführen
        </button>
      </div>
      <ul className="task-list">
        {sequences.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong>
            {!s.active ? " (inaktiv)" : ""}
            <ul className="muted">
              {(stepsBySequence[s.id] ?? []).map((st) => (
                <li key={st.id}>
                  {st.step_order}. {st.kanal} · +{st.delay_days}d
                  {st.subject ? ` · ${st.subject}` : ""}
                  {st.task_titel ? ` · ${st.task_titel}` : ""}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await upsertSequence({ name, active: true });
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setError(null);
            setName("");
            setSequenceId(res.sequenceId);
            router.refresh();
          });
        }}
      >
        <div className="field">
          <label>Neue Sequenz</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button className="btn" type="submit" disabled={pending}>
          Sequenz anlegen
        </button>
      </form>

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!sequenceId) return;
          start(async () => {
            const res = await upsertSequenceStep({
              sequence_id: sequenceId,
              step_order: Number(order),
              kanal,
              delay_days: Number(delay),
              subject: subject || null,
              body: body || null,
              task_titel: taskTitel || null,
            });
            if (res.error) setError(res.error);
            else {
              setError(null);
              router.refresh();
            }
          });
        }}
      >
        <h3 className="section-h">Schritt</h3>
        <div className="grid-3">
          <div className="field">
            <label>Sequenz</label>
            <select
              value={sequenceId}
              onChange={(e) => setSequenceId(e.target.value)}
            >
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Reihenfolge</label>
            <input
              type="number"
              min={1}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Kanal</label>
            <select
              value={kanal}
              onChange={(e) =>
                setKanal(e.target.value as "email" | "call" | "sms" | "task")
              }
            >
              <option value="email">E-Mail</option>
              <option value="call">Call</option>
              <option value="sms">SMS</option>
              <option value="task">Aufgabe</option>
            </select>
          </div>
          <div className="field">
            <label>Delay (Tage)</label>
            <input
              type="number"
              min={0}
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Betreff / Task</label>
            <input
              value={kanal === "task" ? taskTitel : subject}
              onChange={(e) =>
                kanal === "task"
                  ? setTaskTitel(e.target.value)
                  : setSubject(e.target.value)
              }
            />
          </div>
        </div>
        <div className="field">
          <label>Text</label>
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button
          className="btn btn-primary"
          type="submit"
          disabled={pending || !sequenceId}
        >
          Schritt speichern
        </button>
      </form>
    </section>
  );
}

export function WorkflowsPanel({ rules }: { rules: WorkflowRule[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<PipelineStatus>("callback");
  const [titel, setTitel] = useState("Rückruf vorbereiten");
  const [days, setDays] = useState("1");
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="dense-panel">
      <h2 className="section-h">Workflows</h2>
      <p className="muted">
        Wenn der Pipeline-Status wechselt, wird automatisch eine Aufgabe
        angelegt (Europe/Berlin).
      </p>
      <ul className="task-list">
        {rules.map((r) => (
          <li key={r.id} className="task-item">
            <div>
              <strong>{r.name}</strong>
              <div className="muted">
                {PIPELINE_STATUS_LABELS[r.trigger_pipeline_status]} → Aufgabe „
                {r.task_titel}“ in {r.task_due_days} Tag(en)
                {!r.active ? " · inaktiv" : ""}
              </div>
            </div>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await deleteWorkflowRule(r.id);
                  router.refresh();
                })
              }
            >
              Löschen
            </button>
          </li>
        ))}
      </ul>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await upsertWorkflowRule({
              name,
              active: true,
              trigger_pipeline_status: status,
              task_titel: titel,
              task_due_days: Number(days),
            });
            if (res.error) setError(res.error);
            else {
              setError(null);
              setName("");
              router.refresh();
            }
          });
        }}
      >
        <div className="grid-3">
          <div className="field">
            <label>Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Bei Status</label>
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
          </div>
          <div className="field">
            <label>Aufgabe</label>
            <input
              required
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Fällig in Tagen</label>
            <input
              type="number"
              min={0}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Workflow speichern
        </button>
      </form>
    </section>
  );
}
