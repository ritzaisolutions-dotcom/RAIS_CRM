"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Copy, Mail, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/panel";
import { deleteEmailTemplate, upsertEmailTemplate } from "@/lib/sales/actions";
import {
  TEMPLATE_VARIABLES,
  listPlaceholders,
  renderTemplate,
  type TemplateContext,
} from "@/lib/sales/templateVars";
import type { EmailAttachment, EmailTemplate } from "@/lib/sales/types";
import { AttachmentList, AttachmentPicker } from "@/components/attachments/AttachmentPicker";
import { DocumentLibrary } from "@/components/attachments/DocumentLibrary";
import { cn } from "@/lib/utils";

const SAMPLE: TemplateContext = Object.fromEntries(
  TEMPLATE_VARIABLES.map((v) => [v.key, v.example]),
);

type Draft = { id?: string; name: string; subject: string; body: string; attachment_ids: string[] };

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function TemplateEditor({
  templates,
  senderName,
  attachments,
}: {
  templates: EmailTemplate[];
  senderName: string | null;
  attachments: EmailAttachment[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(templates[0]?.id ?? null);
  const selected = templates.find((t) => t.id === selectedId) ?? null;
  const [draft, setDraft] = useState<Draft | null>(
    selected
      ? { id: selected.id, name: selected.name, subject: selected.subject, body: selected.body, attachment_ids: selected.attachment_ids ?? [] }
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const sample = useMemo(
    () => ({ ...SAMPLE, absender: senderName ?? SAMPLE.absender }),
    [senderName],
  );

  function select(t: EmailTemplate) {
    setSelectedId(t.id);
    setDraft({ id: t.id, name: t.name, subject: t.subject, body: t.body, attachment_ids: t.attachment_ids ?? [] });
    setError(null);
    setSaved(false);
  }

  function startNew(copyFrom?: Draft) {
    setSelectedId(null);
    setDraft(
      copyFrom
        ? { name: `${copyFrom.name} (Kopie)`, subject: copyFrom.subject, body: copyFrom.body, attachment_ids: copyFrom.attachment_ids }
        : { name: "", subject: "", body: "Hallo {{vorname|zusammen}},\n\n\n\nViele Grüße\n{{absender}}", attachment_ids: [] },
    );
    setError(null);
    setSaved(false);
  }

  function insertVar(key: string) {
    if (!draft) return;
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) {
      setDraft({ ...draft, body: draft.body + token });
      return;
    }
    const start = el.selectionStart ?? draft.body.length;
    const end = el.selectionEnd ?? start;
    const next = draft.body.slice(0, start) + token + draft.body.slice(end);
    setDraft({ ...draft, body: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const dirty =
    draft !== null &&
    (!selected ||
      draft.name !== selected.name ||
      draft.subject !== selected.subject ||
      draft.body !== selected.body ||
      !sameIds(draft.attachment_ids, selected.attachment_ids ?? []));
  const rs = draft ? renderTemplate(draft.subject, sample) : null;
  const rb = draft ? renderTemplate(draft.body, sample) : null;
  const unknown = [...new Set([...(rs?.unknown ?? []), ...(rb?.unknown ?? [])])];
  const used = draft ? listPlaceholders(`${draft.subject}\n${draft.body}`) : [];

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[18rem_minmax(0,1fr)]">
      {/* Liste */}
      <aside className="flex min-h-0 flex-col border-line bg-surface lg:border-r">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-xs text-fg-muted">{templates.length} Vorlagen</span>
          <Button size="sm" variant="secondary" onClick={() => startNew()}>
            <Plus />
            Neu
          </Button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {selectedId === null && draft ? (
            <li className="rounded-md bg-surface-2 px-2.5 py-2">
              <div className="truncate text-[13px] font-medium">{draft.name || "Neue Vorlage"}</div>
              <div className="text-xs text-fg-subtle">Nicht gespeichert</div>
            </li>
          ) : null}
          {templates.map((t) => {
            const vars = listPlaceholders(`${t.subject}\n${t.body}`);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => select(t)}
                  className={cn(
                    "w-full rounded-md px-2.5 py-2 text-left transition-colors",
                    t.id === selectedId ? "bg-surface-2" : "hover:bg-surface-2/60",
                  )}
                >
                  <div className="truncate text-[13px] font-medium">{t.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
                    <span className="truncate">{t.subject}</span>
                    {vars.length > 0 ? (
                      <Badge tone="violet" className="ml-auto h-4 shrink-0 px-1 text-[10px]">
                        {vars.length} Var.
                      </Badge>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <DocumentLibrary attachments={attachments} />
      </aside>

      {/* Editor + Vorschau */}
      <section className="min-h-0 overflow-y-auto bg-bg">
        {!draft ? (
          <EmptyState
            icon={<Mail />}
            title="Noch keine Vorlagen"
            description="Lege eine Vorlage an — mit oder ohne Variablen."
            action={
              <Button size="sm" onClick={() => startNew()}>
                <Plus />
                Vorlage anlegen
              </Button>
            }
          />
        ) : (
          <div className="mx-auto grid max-w-5xl gap-4 p-5 xl:grid-cols-2">
            <form
              className="grid content-start gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await upsertEmailTemplate({
                    id: draft.id,
                    name: draft.name,
                    subject: draft.subject,
                    body: draft.body,
                    attachment_ids: draft.attachment_ids,
                  });
                  if (res.error) {
                    setError(res.error);
                    return;
                  }
                  setError(null);
                  setSaved(true);
                  router.refresh();
                })
              }}
            >
              <Field label="Name" htmlFor="tpl-name">
                <Input
                  id="tpl-name"
                  required
                  value={draft.name}
                  onChange={(e) => {
                    setDraft({ ...draft, name: e.target.value });
                    setSaved(false);
                  }}
                  placeholder="z. B. Follow-up nach 1 Woche"
                />
              </Field>
              <Field label="Betreff" htmlFor="tpl-subject">
                <Input
                  id="tpl-subject"
                  required
                  value={draft.subject}
                  onChange={(e) => {
                    setDraft({ ...draft, subject: e.target.value });
                    setSaved(false);
                  }}
                />
              </Field>
              <Field label="Text" htmlFor="tpl-body">
                <Textarea
                  id="tpl-body"
                  ref={bodyRef}
                  required
                  rows={14}
                  value={draft.body}
                  onChange={(e) => {
                    setDraft({ ...draft, body: e.target.value });
                    setSaved(false);
                  }}
                  className="font-[inherit]"
                />
              </Field>
              <div>
                <p className="mb-1.5 text-xs text-fg-muted">
                  Variable an der Cursor-Position einfügen — Fallback mit{" "}
                  <code className="rounded bg-surface-3 px-1">{"{{vorname|zusammen}}"}</code>
                </p>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVar(v.key)}
                      className={cn(
                        "h-6 rounded border px-1.5 font-mono text-[11px] transition-colors",
                        used.includes(v.key)
                          ? "border-accent/50 bg-accent-soft text-accent-fg"
                          : "border-line-strong text-fg-muted hover:bg-surface-2 hover:text-fg",
                      )}
                      title={`${v.label}, z. B. „${v.example}"`}
                    >
                      {`{{${v.key}}}`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-fg-muted">
                  Standard-Anhänge — werden beim Wählen der Vorlage vorausgewählt
                </p>
                <AttachmentPicker
                  attachments={attachments}
                  selected={draft.attachment_ids}
                  onChange={(ids) => {
                    setDraft({ ...draft, attachment_ids: ids });
                    setSaved(false);
                  }}
                />
              </div>
              {unknown.length > 0 ? (
                <p className="text-xs text-[var(--tone-red-fg)]">
                  Unbekannte Platzhalter: {unknown.map((u) => `{{${u}}}`).join(", ")} — beim Senden gesperrt.
                </p>
              ) : null}
              {error ? <p className="text-[13px] text-[var(--tone-red-fg)]">{error}</p> : null}
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <Button type="submit" size="sm" disabled={pending || !dirty}>
                  {draft.id ? "Änderungen speichern" : "Vorlage speichern"}
                </Button>
                {saved && !dirty ? (
                  <span className="text-xs text-[var(--tone-green-fg)]">Gespeichert</span>
                ) : null}
                <div className="ml-auto flex gap-1">
                  {draft.id ? (
                    <>
                      <Button type="button" variant="ghost" size="sm" onClick={() => startNew(draft)}>
                        <Copy />
                        Duplizieren
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-[var(--tone-red-fg)] hover:text-[var(--tone-red-fg)]"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            if (!confirm(`Vorlage „${draft.name}" löschen?`)) return;
                            const res = await deleteEmailTemplate(draft.id!);
                            if (res.error) {
                              setError(res.error);
                              return;
                            }
                            const rest = templates.filter((t) => t.id !== draft.id);
                            if (rest[0]) select(rest[0]);
                            else {
                              setSelectedId(null);
                              setDraft(null);
                            }
                            router.refresh();
                          })
                        }
                      >
                        <Trash2 />
                        Löschen
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </form>

            <div className="content-start">
              <p className="mb-1.5 text-xs font-medium text-fg-muted">
                Vorschau mit Beispiel-Lead
                <span className="font-normal text-fg-subtle"> (Anna Becker, Becker Immobilien GmbH, Leipzig)</span>
              </p>
              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-4 py-2.5">
                  <div className="text-xs text-fg-subtle">Betreff</div>
                  <div className="text-[13px] font-medium">{rs?.text || "—"}</div>
                </div>
                <div className="min-h-64 whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed">
                  {rb?.text || <span className="text-fg-subtle">Noch kein Text.</span>}
                </div>
                {draft.attachment_ids.length ? (
                  <div className="border-t border-line px-4 py-2.5 text-[13px]">
                    <AttachmentList attachments={attachments} ids={draft.attachment_ids} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
