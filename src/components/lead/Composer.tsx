"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckSquare, Mail, PhoneCall, Save, Send, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createTask,
  insertTouchpoint,
  sendCompanyEmail,
  setListPipelineStatus,
  upsertEmailTemplate,
} from "@/lib/sales/actions";
import { businessToday, skipWeekend } from "@/lib/sales/dates";
import {
  FOLLOW_UP_QUICK,
  formatDateDe,
  resolveStatusChoice,
} from "@/lib/sales/leads";
import {
  TEMPLATE_VARIABLES,
  buildTemplateContext,
  renderTemplate,
} from "@/lib/sales/templateVars";
import type {
  EmailAttachment,
  EmailTemplate,
  Person,
  PipelineStatus,
  TouchErgebnis,
} from "@/lib/sales/types";
import { cn } from "@/lib/utils";
import { SlotPicker } from "@/components/lead/SlotPicker";
import { AttachmentPicker } from "@/components/attachments/AttachmentPicker";
import { AiDraftButton } from "@/components/lead/AiDraftButton";
import { createAsanaTaskForLead } from "@/lib/sales/assistActions";

export type ComposerTab = "note" | "email" | "call" | "task";

type LeadCtx = {
  companyId: string;
  name: string;
  stadt: string | null;
  website: string | null;
  status: PipelineStatus;
};

/* Wiedervorlage-Chips, gemeinsam für Notiz / Anruf / Aufgabe. */
function DueChips({
  value,
  onChange,
  allowNone = true,
}: {
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
}) {
  const today = businessToday();
  return (
    <div className="flex flex-wrap items-center gap-1">
      {allowNone ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className={cn(
            "h-6 rounded-md border px-2 text-xs",
            value === "" ? "border-accent bg-accent-soft text-accent-fg" : "border-line-strong text-fg-muted hover:bg-surface-2",
          )}
        >
          Keine
        </button>
      ) : null}
      {FOLLOW_UP_QUICK.map((p) => {
        const due = p.due(today);
        return (
          <button
            key={p.key}
            type="button"
            title={formatDateDe(due)}
            onClick={() => onChange(due)}
            className={cn(
              "h-6 rounded-md border px-2 text-xs",
              value === due
                ? "border-accent bg-accent-soft text-accent-fg"
                : "border-line-strong text-fg-muted hover:bg-surface-2",
            )}
          >
            {p.label}
          </button>
        );
      })}
      <input
        type="date"
        min={today}
        value={value}
        onChange={(e) => onChange(e.target.value ? skipWeekend(e.target.value) : "")}
        className="h-6 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-fg-muted"
        aria-label="Datum wählen"
      />
    </div>
  );
}

function Feedback({ error, msg }: { error: string | null; msg: string | null }) {
  if (error) return <p className="text-[13px] text-[var(--tone-red-fg)]">{error}</p>;
  if (msg) return <p className="text-[13px] text-[var(--tone-green-fg)]">{msg}</p>;
  return null;
}

/* ------------------------------------------------------------------ */

function NoteForm({ lead, people }: { lead: LeadCtx; people: Person[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const main = people.find((p) => p.ist_entscheider) ?? people[0];

  return (
    <form
      className="grid gap-2.5 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        start(async () => {
          const res = await insertTouchpoint({
            company_id: lead.companyId,
            person_id: main?.id ?? null,
            kanal: "note",
            ergebnis: "kein_ergebnis",
            notiz: text.trim(),
            naechster_touch: due || null,
            abbruchgrund: null,
          });
          if (res.error) {
            setError(res.error);
            return;
          }
          setError(null);
          setMsg("Notiz gespeichert.");
          setText("");
          setDue("");
          router.refresh();
        });
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setMsg(null);
        }}
        placeholder="Notiz zum Lead…"
        rows={3}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-muted">Wiedervorlage</span>
          <DueChips value={due} onChange={setDue} />
        </div>
        <Button type="submit" size="sm" disabled={pending || !text.trim()}>
          Notiz speichern
        </Button>
      </div>
      <Feedback error={error} msg={msg} />
    </form>
  );
}

/* ------------------------------------------------------------------ */

type Outcome = {
  key: string;
  label: string;
  ergebnis: TouchErgebnis;
  status?: PipelineStatus;
};

const CALL_OUTCOMES: Outcome[] = [
  { key: "ne", label: "Nicht erreicht", ergebnis: "nicht_erreicht", status: "kein_anschluss_1" },
  { key: "rr", label: "Rückruf vereinbart", ergebnis: "erreicht_ohne_gespraech", status: "callback" },
  { key: "gg", label: "Gespräch geführt", ergebnis: "gespraech_ohne_termin" },
  { key: "tg", label: "Termin gebucht", ergebnis: "termin_gebucht", status: "set_appointment" },
  { key: "ki", label: "Kein Interesse", ergebnis: "disqualifiziert", status: "disqualified" },
];

const DM_OUTCOMES: Outcome[] = [
  { key: "dm_sent", label: "Nachricht gesendet", ergebnis: "kein_ergebnis" },
  { key: "dm_reply", label: "Antwort erhalten", ergebnis: "erreicht_ohne_gespraech" },
  { key: "gg", label: "Gespräch geführt", ergebnis: "gespraech_ohne_termin" },
  { key: "tg", label: "Termin gebucht", ergebnis: "termin_gebucht", status: "set_appointment" },
  { key: "ki", label: "Kein Interesse", ergebnis: "disqualifiziert", status: "disqualified" },
];

const CHANNELS = [
  { key: "call", label: "Anruf", outcomes: CALL_OUTCOMES },
  { key: "dm", label: "LinkedIn", outcomes: DM_OUTCOMES },
] as const;
type Channel = (typeof CHANNELS)[number]["key"];

function CallForm({
  lead,
  people,
  asanaConfigured,
}: {
  lead: LeadCtx;
  people: Person[];
  asanaConfigured: boolean;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("call");
  const outcomes = CHANNELS.find((c) => c.key === channel)!.outcomes;
  const [outcome, setOutcome] = useState(CALL_OUTCOMES[0].key);
  const [text, setText] = useState("");
  const [due, setDue] = useState(FOLLOW_UP_QUICK[1].due(businessToday()));
  const [personId, setPersonId] = useState(
    (people.find((p) => p.ist_entscheider) ?? people[0])?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chosen = outcomes.find((o) => o.key === outcome) ?? outcomes[0];
  const channelLabel = channel === "dm" ? "LinkedIn-Nachricht" : "Anruf";
  const [toAsana, setToAsana] = useState(true);

  return (
    <form
      className="grid gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          let res: { error?: string };
          if (chosen.status) {
            // Status-Wechsel schreibt selbst einen Anruf-Touch inkl. Wiedervorlage.
            res = await setListPipelineStatus({
              companyId: lead.companyId,
              pipelineStatus: resolveStatusChoice(chosen.status, lead.status),
              kanal: channel,
              naechsterTouch: due || null,
            });
            if (!res.error && text.trim()) {
              res = await insertTouchpoint({
                company_id: lead.companyId,
                person_id: personId || null,
                kanal: "note",
                ergebnis: "kein_ergebnis",
                notiz: `${channelLabel}: ${text.trim()}`,
                naechster_touch: null,
                abbruchgrund: null,
              });
            }
          } else {
            res = await insertTouchpoint({
              company_id: lead.companyId,
              person_id: personId || null,
              kanal: channel,
              ergebnis: chosen.ergebnis,
              notiz: text.trim() || null,
              naechster_touch: due || null,
              abbruchgrund: null,
            });
          }
          if (res.error) {
            setError(res.error);
            return;
          }
          let asanaNote = "";
          if (chosen.key === "tg" && asanaConfigured && toAsana) {
            const a = await createAsanaTaskForLead({
              companyId: lead.companyId,
              title: `Termin: ${lead.name}`,
              dueOn: due || null,
              note: text.trim() || null,
            });
            asanaNote = a.error ? ` Asana: ${a.error}` : " Aufgabe in Asana angelegt.";
          }
          setError(null);
          setMsg(`${channelLabel} protokolliert.${asanaNote}`);
          setText("");
          router.refresh();
        });
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-fg-muted">Kanal</span>
        <div className="inline-flex rounded-md border border-line-strong p-0.5">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setChannel(c.key);
                setOutcome(c.outcomes[0].key);
                setMsg(null);
              }}
              className={cn(
                "h-6 rounded px-2.5 text-[13px]",
                channel === c.key ? "bg-surface-3 font-medium text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {outcomes.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setOutcome(o.key)}
            className={cn(
              "h-7 rounded-md border px-2.5 text-[13px]",
              outcome === o.key
                ? "border-accent bg-accent-soft font-medium text-accent-fg"
                : "border-line-strong text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {people.length > 1 ? (
        <NativeSelect value={personId} onChange={(e) => setPersonId(e.target.value)} className="max-w-xs">
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      ) : null}
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setMsg(null);
        }}
        placeholder={channel === "dm" ? "Was hast du geschrieben / was kam zurück? (optional)" : "Was wurde besprochen? (optional)"}
        rows={2}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-muted">Wiedervorlage</span>
          <DueChips value={due} onChange={setDue} />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {channel === "dm" ? "Nachricht speichern" : "Anruf speichern"}
        </Button>
      </div>
      {chosen.key === "tg" && asanaConfigured ? (
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={toAsana}
            onChange={(e) => setToAsana(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Aufgabe in Asana anlegen (fällig am Wiedervorlage-Datum)
        </label>
      ) : null}
      {chosen.status ? (
        <p className="text-xs text-fg-subtle">
          Setzt den Status auf{" "}
          <Badge tone="gray">
            {chosen.status === "kein_anschluss_1" ? "Nicht erreicht (zählt hoch)" : chosen.label}
          </Badge>
        </p>
      ) : null}
      <Feedback error={error} msg={msg} />
    </form>
  );
}

/* ------------------------------------------------------------------ */

function TaskForm({ lead, people }: { lead: LeadCtx; people: Person[] }) {
  const router = useRouter();
  const [titel, setTitel] = useState("");
  const [due, setDue] = useState(FOLLOW_UP_QUICK[0].due(businessToday()));
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const main = people.find((p) => p.ist_entscheider) ?? people[0];

  return (
    <form
      className="grid gap-2.5 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!titel.trim() || !due) return;
        start(async () => {
          const res = await createTask({
            company_id: lead.companyId,
            titel: titel.trim(),
            due_on: due,
            person_id: main?.id ?? null,
            art: "follow_up",
            set_naechster: true,
          });
          if (res.error) {
            setError(res.error);
            return;
          }
          setError(null);
          setMsg("Aufgabe angelegt.");
          setTitel("");
          router.refresh();
        });
      }}
    >
      <Input
        value={titel}
        onChange={(e) => {
          setTitel(e.target.value);
          setMsg(null);
        }}
        placeholder="z. B. Angebot nachfassen"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-muted">Fällig</span>
          <DueChips value={due} onChange={setDue} allowNone={false} />
        </div>
        <Button type="submit" size="sm" disabled={pending || !titel.trim() || !due}>
          Aufgabe anlegen
        </Button>
      </div>
      <p className="text-xs text-fg-subtle">Setzt zugleich die Wiedervorlage auf das Fälligkeitsdatum.</p>
      <Feedback error={error} msg={msg} />
    </form>
  );
}

/* ------------------------------------------------------------------ */

function EmailForm({
  lead,
  people,
  templates,
  senderName,
  personId: initialPersonId,
  attachments,
}: {
  lead: LeadCtx;
  people: Person[];
  templates: EmailTemplate[];
  senderName: string | null;
  personId?: string | null;
  attachments: EmailAttachment[];
}) {
  const router = useRouter();
  const withEmail = people.filter((p) => p.email);
  const fallback = (withEmail.find((p) => p.ist_entscheider) ?? withEmail[0])?.id ?? "";
  const [personId, setPersonId] = useState(initialPersonId ?? fallback);
  const person = people.find((p) => p.id === personId) ?? null;
  const [to, setTo] = useState(person?.email ?? "");
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);
  const [slotBlock, setSlotBlock] = useState<string | null>(null);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (initialPersonId) {
      setPersonId(initialPersonId);
      const p = people.find((x) => x.id === initialPersonId);
      if (p?.email) setTo(p.email);
    }
  }, [initialPersonId, people]);

  const ctx = useMemo(
    () =>
      buildTemplateContext({
        personName: person?.name,
        firma: lead.name,
        stadt: lead.stadt,
        website: lead.website,
        absender: senderName,
      }),
    [person?.name, lead.name, lead.stadt, lead.website, senderName],
  );
  const fullCtx = useMemo(
    () => ({ ...ctx, terminvorschlaege: slotBlock }),
    [ctx, slotBlock],
  );
  const rs = renderTemplate(subject, fullCtx);
  const rb = renderTemplate(body, fullCtx);
  const missing = [...new Set([...rs.missing, ...rb.missing])];
  const unknown = [...new Set([...rs.unknown, ...rb.unknown])];
  const hasVars = subject.includes("{{") || body.includes("{{");
  const blocked = missing.length > 0 || unknown.length > 0;

  function insertVar(key: string) {
    setBody((b) => `${b}{{${key}}}`);
  }

  return (
    <form
      className="grid gap-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (blocked) return;
        start(async () => {
          const res = await sendCompanyEmail({
            company_id: lead.companyId,
            person_id: personId || null,
            to_email: to,
            subject: rs.text,
            body: rb.text,
            template_id: templateId || null,
            attachment_ids: attachmentIds.filter((id) => attachments.some((a) => a.id === id)),
          });
          if (res.error) {
            setError(res.error);
            setMsg(null);
            return;
          }
          setError(null);
          setMsg(
            res.status === "sent"
              ? "E-Mail gesendet."
              : res.status === "failed"
                ? "Senden fehlgeschlagen — Details in der Aktivität."
                : "E-Mail in der Warteschlange (SMTP nicht eingerichtet?).",
          );
          setSubject("");
          setBody("");
          setTemplateId("");
          setAttachmentIds([]);
          setPreview(false);
          setSlotBlock(null);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-xs text-fg-muted">An</span>
          {withEmail.length > 0 ? (
            <NativeSelect
              value={personId}
              onChange={(e) => {
                setPersonId(e.target.value);
                const p = people.find((x) => x.id === e.target.value);
                setTo(p?.email ?? "");
              }}
            >
              {withEmail.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} &lt;{p.email}&gt;
                </option>
              ))}
              <option value="">Andere Adresse…</option>
            </NativeSelect>
          ) : null}
          {withEmail.length === 0 || !personId ? (
            <Input
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="empfaenger@firma.de"
            />
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs text-fg-muted">Vorlage</span>
          <NativeSelect
            value={templateId}
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              setTemplateId(e.target.value);
              if (t) {
                setSubject(t.subject);
                setBody(t.body);
                setAttachmentIds(t.attachment_ids ?? []);
              }
            }}
          >
            <option value="">— ohne Vorlage —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <Input
        required
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Betreff"
      />
      {preview && hasVars ? (
        <div className="min-h-40 whitespace-pre-wrap rounded-md border border-line bg-surface-2/60 px-3 py-2 text-[13px] leading-relaxed">
          <div className="mb-2 font-medium">{rs.text}</div>
          {rb.text}
        </div>
      ) : (
        <Textarea
          required
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Text … Variablen wie {{vorname}} werden beim Senden ersetzt."
        />
      )}
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs text-fg-subtle">Variable einfügen:</span>
        {TEMPLATE_VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => insertVar(v.key)}
            className="h-6 rounded border border-line-strong px-1.5 font-mono text-[11px] text-fg-muted hover:bg-surface-2 hover:text-fg"
            title={`${v.label}, z. B. „${v.example}"`}
          >
            {`{{${v.key}}}`}
          </button>
        ))}
      </div>
      <AttachmentPicker attachments={attachments} selected={attachmentIds} onChange={setAttachmentIds} />
      {missing.length > 0 ? (
        <p className="rounded-md bg-[var(--tone-yellow-bg)] px-2.5 py-1.5 text-xs text-[var(--tone-yellow-fg)]">
          Für {missing.map((m) => `{{${m}}}`).join(", ")} fehlt ein Wert. Ergänze ihn beim Lead
          oder nutze einen Fallback wie {"{{vorname|zusammen}}"}.
          {missing.includes("absender") ? " Absendername: MAIL_SENDER_NAME in .env.local setzen." : ""}
          {missing.includes("terminvorschlaege") ? " Für {{terminvorschlaege}}: unten auf „Termine vorschlagen“ klicken." : ""}
        </p>
      ) : null}
      {unknown.length > 0 ? (
        <p className="text-xs text-[var(--tone-red-fg)]">
          Unbekannte Platzhalter: {unknown.map((m) => `{{${m}}}`).join(", ")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <AiDraftButton
            companyId={lead.companyId}
            personId={personId || null}
            subject={subject}
            body={body}
            withSlots={slotBlock !== null || body.includes("{{terminvorschlaege}}")}
            senderName={senderName}
            onDraft={(d) => {
              setSubject(d.subject);
              setBody(d.body);
              setPreview(false);
              setTemplateId("");
            }}
          />
          <SlotPicker
            companyId={lead.companyId}
            personId={personId || null}
            hasBlock={slotBlock !== null}
            onInsert={(block) => {
              setSlotBlock(block);
              setBody((b) =>
                b.includes("{{terminvorschlaege}}")
                  ? b
                  : [b.trimEnd(), "{{terminvorschlaege}}"].filter(Boolean).join("\n\n") + "\n",
              );
            }}
          />
          {hasVars ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? "Bearbeiten" : "Vorschau"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || !subject.trim() || !body.trim()}
            onClick={() => {
              const name = prompt("Name der neuen Vorlage", subject.slice(0, 60));
              if (!name?.trim()) return;
              start(async () => {
                const res = await upsertEmailTemplate({ name: name.trim(), subject, body, attachment_ids: attachmentIds });
                if (res.error) setError(res.error);
                else {
                  setMsg(`Vorlage „${name.trim()}" gespeichert.`);
                  router.refresh();
                }
              });
            }}
          >
            <Save />
            Als Vorlage speichern
          </Button>
          <Link href="/vorlagen" className="text-xs text-fg-subtle hover:text-fg">
            Vorlagen verwalten
          </Link>
        </div>
        <Button type="submit" size="sm" disabled={pending || blocked || !to}>
          <Send />
          Senden
        </Button>
      </div>
      <Feedback error={error} msg={msg} />
    </form>
  );
}

/* ------------------------------------------------------------------ */

export function Composer({
  lead,
  people,
  templates,
  senderName,
  tab,
  onTabChange,
  emailPersonId,
  asanaConfigured = false,
  attachments = [],
}: {
  lead: LeadCtx;
  people: Person[];
  templates: EmailTemplate[];
  senderName: string | null;
  tab: ComposerTab;
  onTabChange: (t: ComposerTab) => void;
  emailPersonId?: string | null;
  asanaConfigured?: boolean;
  attachments?: EmailAttachment[];
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => onTabChange(v as ComposerTab)}
      className="rounded-lg border border-line bg-surface"
    >
      <TabsList>
        <TabsTrigger value="note">
          <StickyNote />
          Notiz
        </TabsTrigger>
        <TabsTrigger value="email">
          <Mail />
          E-Mail
        </TabsTrigger>
        <TabsTrigger value="call">
          <PhoneCall />
          Kontakt loggen
        </TabsTrigger>
        <TabsTrigger value="task">
          <CheckSquare />
          Aufgabe
        </TabsTrigger>
      </TabsList>
      <TabsContent value="note">
        <NoteForm lead={lead} people={people} />
      </TabsContent>
      <TabsContent value="email">
        <EmailForm
          lead={lead}
          people={people}
          templates={templates}
          senderName={senderName}
          personId={emailPersonId}
          attachments={attachments}
        />
      </TabsContent>
      <TabsContent value="call">
        <CallForm lead={lead} people={people} asanaConfigured={asanaConfigured} />
      </TabsContent>
      <TabsContent value="task">
        <TaskForm lead={lead} people={people} />
      </TabsContent>
    </Tabs>
  );
}
