"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Loader2,
  Plus,
  Send,
  Star,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/menu";
import { AiDraftButton } from "@/components/lead/AiDraftButton";
import { AttachmentList, AttachmentPicker } from "@/components/attachments/AttachmentPicker";
import { upsertPerson } from "@/lib/sales/actions";
import {
  fetchBusyForDay,
  fetchInviteContext,
  sendCalendarInvite,
  type InviteContext,
} from "@/lib/sales/inviteActions";
import { addBusinessDays, businessToday, BUSINESS_TZ } from "@/lib/sales/dates";
import { berlinToIso, freeSlots } from "@/lib/sales/slots";
import { buildTemplateContext, renderTemplate } from "@/lib/sales/templateVars";
import type { Person } from "@/lib/sales/types";
import { cn } from "@/lib/utils";

const DURATIONS = [15, 30, 45, 60];
const TIMES = Array.from({ length: (20 - 7) * 4 + 1 }, (_, i) => {
  const m = 7 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const STEPS = ["Kontakt", "Termin", "Nachricht", "Bestätigen"] as const;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const labelFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: BUSINESS_TZ,
  weekday: "long",
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
const hm = new Intl.DateTimeFormat("de-DE", { timeZone: BUSINESS_TZ, hour: "2-digit", minute: "2-digit" });

const DEFAULT_SUBJECT = "Unser Gespräch am {{termin}}";
const DEFAULT_BODY = `Hallo {{vorname|zusammen}},

wie besprochen habe ich uns einen Termin eingetragen:

{{termin}}
Google Meet: {{meetlink}}

Sie bekommen zusätzlich eine Kalendereinladung. Falls der Termin doch nicht passt, antworten Sie einfach kurz auf diese Mail.

Viele Grüße
{{absender|Kevin Ritz}}`;

type ContactDraft = { id: string | null; name: string; rolle: string; email: string; telefon: string; kontext: string };

function draftFrom(p: Person | null): ContactDraft {
  return {
    id: p?.id ?? null,
    name: p?.name ?? "",
    rolle: p?.rolle ?? "",
    email: p?.email ?? "",
    telefon: p?.telefon ?? "",
    kontext: p?.kontext ?? "",
  };
}

function pickDefault(people: Person[]): Person | null {
  return people.find((p) => p.ist_entscheider && p.email) ?? people.find((p) => p.email) ?? people[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Einstiege                                                           */
/* ------------------------------------------------------------------ */

/** Button „Termin einladen“ auf der Lead-Seite. */
export function InviteDialog(props: Omit<InviteContext, "companyId"> & { companyId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <CalendarPlus />
        Termin einladen
      </Button>
      {open ? <InviteWizard ctx={props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Kalender-Icon in der Leads-Liste: lädt Kontakte erst beim Klick. */
export function InviteFromList({
  companyId,
  firma,
  variant = "icon",
}: {
  companyId: string;
  firma: string;
  /** icon: Zeilen-Aktion · button: beschrifteter Button (Auswahlleiste) */
  variant?: "icon" | "button";
}) {
  const [ctx, setCtx] = useState<InviteContext | null>(null);
  const [loading, start] = useTransition();
  const openWizard = () =>
    start(async () => {
      const res = await fetchInviteContext(companyId);
      if ("error" in res) {
        alert(res.error);
        return;
      }
      setCtx(res);
    });
  return (
    <>
      {variant === "button" ? (
        <Button size="sm" disabled={loading} onClick={openWizard}>
          {loading ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
          Termin einladen
        </Button>
      ) : (
        <Tooltip content="Termin einladen">
          <button
            type="button"
            aria-label={`${firma}: Termin einladen`}
            disabled={loading}
            onClick={openWizard}
            className="flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-3 hover:text-fg"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarPlus className="size-3.5" />}
          </button>
        </Tooltip>
      )}
      {ctx ? <InviteWizard ctx={ctx} onClose={() => setCtx(null)} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Wizard                                                              */
/* ------------------------------------------------------------------ */

function InviteWizard({ ctx, onClose }: { ctx: InviteContext; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [people, setPeople] = useState<Person[]>(ctx.people);
  const [contact, setContact] = useState<ContactDraft>(() => draftFrom(pickDefault(ctx.people)));

  const [day, setDay] = useState(() => addBusinessDays(businessToday(), 1));
  const [time, setTime] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState(false);
  const [duration, setDuration] = useState(30);
  const [title, setTitle] = useState(`Erstgespräch RAIS × ${ctx.companyName}`);
  const [busy, setBusy] = useState<{ start: string; end: string }[] | null>(null);
  const [busyError, setBusyError] = useState<string | null>(null);

  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [preview, setPreview] = useState(false);
  const [googleInvite, setGoogleInvite] = useState(true);
  const [toAsana, setToAsana] = useState(true);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ meetLink: string | null; htmlLink: string | null; warning?: string } | null>(null);
  const [pending, start] = useTransition();

  // Belegte Zeiten des gewählten Tages aus Google laden.
  useEffect(() => {
    let alive = true;
    setBusy(null);
    fetchBusyForDay(day).then((res) => {
      if (!alive) return;
      if ("error" in res) {
        setBusyError(res.error);
        setBusy([]);
      } else {
        setBusyError(null);
        setBusy(res.busy);
      }
    });
    return () => {
      alive = false;
    };
  }, [day]);

  const slots = useMemo(() => (busy ? freeSlots(busy, day, duration) : []), [busy, day, duration]);
  const startsAt = time ? berlinToIso(day, time) : null;
  const endsAt = startsAt ? new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString() : null;
  const whenLabel = startsAt ? `${labelFmt.format(new Date(startsAt))} Uhr` : "";
  const conflict =
    !!startsAt &&
    !!endsAt &&
    (busy ?? []).some((b) => new Date(b.start) < new Date(endsAt) && new Date(b.end) > new Date(startsAt));

  // Freien Standard-Slot vorschlagen, sobald der Kalender geladen ist.
  useEffect(() => {
    if (customTime || !busy) return;
    if (time && slots.some((s) => s.time === time && s.free)) return;
    setTime(slots.find((s) => s.free)?.time ?? null);
  }, [busy, slots, customTime, time]);

  const tplCtx = {
    ...buildTemplateContext({
      personName: contact.name,
      firma: ctx.companyName,
      stadt: ctx.stadt,
      website: ctx.website,
      absender: ctx.senderName,
    }),
    termin: whenLabel,
    meetlink: "{{meetlink}}",
  };
  const rs = renderTemplate(subject, tplCtx);
  const rb = renderTemplate(body, tplCtx);
  const missing = [...new Set([...rs.missing, ...rb.missing])];
  const unknown = [...new Set([...rs.unknown, ...rb.unknown])];

  const original = people.find((p) => p.id === contact.id) ?? null;
  const contactChanged =
    !original ||
    contact.name.trim() !== original.name ||
    contact.email.trim().toLowerCase() !== (original.email ?? "") ||
    contact.telefon.trim() !== (original.telefon ?? "") ||
    contact.kontext.trim() !== (original.kontext ?? "");

  const stepValid = [
    contact.name.trim().length > 0 && EMAIL_RE.test(contact.email.trim()),
    !!startsAt && title.trim().length > 0,
    subject.trim().length > 0 && body.trim().length > 0 && missing.length === 0 && unknown.length === 0,
    true,
  ];

  /** Schritt 1 → 2: geänderten/neuen Kontakt speichern. */
  function saveContactThenNext() {
    if (!contactChanged) {
      setStep(1);
      return;
    }
    start(async () => {
      const res = await upsertPerson({
        id: contact.id ?? undefined,
        company_id: ctx.companyId,
        name: contact.name.trim(),
        rolle: contact.rolle.trim() || null,
        email: contact.email.trim().toLowerCase(),
        telefon: contact.telefon.trim() || null,
        linkedin_url: original?.linkedin_url ?? null,
        ist_entscheider: original?.ist_entscheider ?? people.length === 0,
        kontext: contact.kontext.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      // Neu laden, damit ein neuer Kontakt seine ID bekommt.
      const fresh = await fetchInviteContext(ctx.companyId);
      if (!("error" in fresh)) {
        setPeople(fresh.people);
        const email = contact.email.trim().toLowerCase();
        const saved = fresh.people.find((p) => (contact.id ? p.id === contact.id : p.email === email));
        if (saved) setContact(draftFrom(saved));
      }
      setError(null);
      setStep(1);
      router.refresh();
    });
  }

  function send() {
    if (!startsAt) return;
    start(async () => {
      const res = await sendCalendarInvite({
        companyId: ctx.companyId,
        personId: contact.id,
        toEmail: contact.email.trim().toLowerCase(),
        attendeeName: contact.name.trim() || null,
        startsAt,
        durationMin: duration,
        title,
        subject: rs.text,
        body: rb.text,
        sendGoogleInvite: googleInvite,
        toAsana: ctx.asanaConfigured && toAsana,
        attachmentIds,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setError(null);
      setResult({ meetLink: res.meetLink, htmlLink: res.htmlLink, warning: res.warning });
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Termin einladen · ${ctx.companyName}`}
        description={result ? undefined : "Kontakt prüfen, Zeit wählen, Nachricht schreiben, bestätigen."}
        className="max-w-2xl"
      >
        {result ? (
          <div className="space-y-3 text-[13px]">
            <p className="flex items-center gap-2 font-medium text-[var(--tone-green-fg)]">
              <Check className="size-4" /> Einladung gesendet: {whenLabel}
            </p>
            {result.meetLink ? (
              <a href={result.meetLink} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-accent-fg hover:underline">
                <Video className="size-4" /> {result.meetLink}
              </a>
            ) : null}
            {result.htmlLink ? (
              <a href={result.htmlLink} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-fg-muted hover:text-fg">
                <ExternalLink className="size-3.5" /> Im Google Kalender öffnen
              </a>
            ) : null}
            {result.warning ? (
              <p className="rounded-md bg-[var(--tone-yellow-bg)] px-3 py-2 text-xs text-[var(--tone-yellow-fg)]">{result.warning}</p>
            ) : null}
            <p className="text-xs text-fg-subtle">Im Verlauf eingetragen, Status „Termin gebucht“, Wiedervorlage am Termintag.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            <Stepper step={step} />

            {step === 0 ? (
              <StepContact people={people} contact={contact} setContact={setContact} />
            ) : null}

            {step === 1 ? (
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
                  <Field label="Datum" htmlFor="inv-day">
                    <Input
                      id="inv-day"
                      type="date"
                      required
                      min={businessToday()}
                      value={day}
                      onChange={(e) => {
                        setDay(e.target.value);
                        if (!customTime) setTime(null);
                      }}
                    />
                  </Field>
                  <Field label="Dauer">
                    <div className="flex h-8 gap-1">
                      {DURATIONS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDuration(d)}
                          className={cn(
                            "rounded-md border px-2.5 text-xs",
                            d === duration ? "border-accent bg-accent-soft font-medium text-accent-fg" : "border-line-strong text-fg-muted hover:bg-surface-2",
                          )}
                        >
                          {d} Min.
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-fg-muted">Uhrzeit</span>
                    <button
                      type="button"
                      onClick={() => setCustomTime((c) => !c)}
                      className="text-xs text-fg-muted hover:text-fg"
                    >
                      {customTime ? "Freie Zeiten anzeigen" : "Andere Uhrzeit"}
                    </button>
                  </div>
                  {customTime ? (
                    <NativeSelect value={time ?? ""} onChange={(e) => setTime(e.target.value)} className="max-w-[8rem]">
                      <option value="" disabled>
                        –
                      </option>
                      {TIMES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : busy === null ? (
                    <p className="text-xs text-fg-subtle">Prüfe deinen Kalender…</p>
                  ) : (
                    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7">
                      {slots.map((s) => (
                        <button
                          key={s.time}
                          type="button"
                          disabled={!s.free}
                          onClick={() => setTime(s.time)}
                          title={s.past ? "Vorbei" : s.free ? undefined : "Belegt"}
                          className={cn(
                            "h-8 rounded-md border text-[13px] tabular-nums",
                            time === s.time
                              ? "border-accent bg-accent text-white"
                              : s.free
                                ? "border-line-strong hover:border-accent hover:bg-accent-soft"
                                : "cursor-not-allowed border-line text-fg-subtle line-through opacity-50",
                          )}
                        >
                          {s.time}
                        </button>
                      ))}
                    </div>
                  )}
                  {busyError ? <p className="text-xs text-[var(--tone-yellow-fg)]">{busyError}</p> : null}
                  {busy && busy.length > 0 ? (
                    <p className="text-xs text-fg-subtle">
                      Belegt: {busy.map((b) => `${hm.format(new Date(b.start))}–${hm.format(new Date(b.end))}`).join(", ")}
                    </p>
                  ) : null}
                  {conflict ? (
                    <p className="flex items-center gap-1 text-xs font-medium text-[var(--tone-red-fg)]">
                      <CircleAlert className="size-3.5" /> Überschneidet sich mit einem bestehenden Termin.
                    </p>
                  ) : null}
                </div>

                <Field label="Titel im Kalender" htmlFor="inv-title">
                  <Input id="inv-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-fg-muted">E-Mail an {contact.email}</span>
                  <div className="flex gap-1.5">
                    <AiDraftButton
                      companyId={ctx.companyId}
                      personId={contact.id}
                      subject={subject}
                      body={body}
                      withSlots={false}
                      senderName={ctx.senderName}
                      requiredPlaceholders={["termin", "meetlink"]}
                      extraContext={`Termin-Einladung: ${whenLabel}, ${duration} Minuten, per Google Meet. Der Meet-Link wird beim Senden automatisch eingesetzt.${contact.kontext ? ` Kontext zur Person: ${contact.kontext}` : ""}`}
                      quick={[
                        "Kurze, freundliche Einladung nach unserem Telefonat",
                        "Etwas formeller, mit 2–3 Punkten Agenda",
                        "Locker, mit Bezug auf das letzte Gespräch",
                      ]}
                      onDraft={(d) => {
                        setSubject(d.subject);
                        setBody(d.body);
                        setPreview(false);
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setPreview((p) => !p)}>
                      {preview ? "Bearbeiten" : "Vorschau"}
                    </Button>
                  </div>
                </div>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="Betreff" />
                {preview ? (
                  <MailPreview subject={rs.text} body={rb.text} />
                ) : (
                  <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} required />
                )}
                <AttachmentPicker
                  attachments={ctx.attachments}
                  selected={attachmentIds}
                  onChange={setAttachmentIds}
                />
                {missing.length || unknown.length ? (
                  <p className="text-xs text-[var(--tone-red-fg)]">
                    {missing.length ? `Fehlende Werte: ${missing.map((m) => `{{${m}}}`).join(", ")}. ` : ""}
                    {unknown.length ? `Unbekannt: ${unknown.map((m) => `{{${m}}}`).join(", ")}.` : ""}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={googleInvite} onChange={(e) => setGoogleInvite(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                    Zusätzlich Google-Kalendereinladung senden
                  </label>
                  {ctx.asanaConfigured ? (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={toAsana} onChange={(e) => setToAsana(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                      Aufgabe in Asana anlegen
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-3 text-[13px]">
                <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 rounded-md border border-line bg-surface-2/50 px-4 py-3">
                  <dt className="text-fg-muted">An</dt>
                  <dd>
                    <span className="font-medium">{contact.name}</span> &lt;{contact.email}&gt;
                  </dd>
                  <dt className="text-fg-muted">Wann</dt>
                  <dd className="font-medium">
                    {whenLabel} · {duration} Min.
                    {conflict ? <span className="ml-2 text-[var(--tone-red-fg)]">(Überschneidung!)</span> : null}
                  </dd>
                  <dt className="text-fg-muted">Kalender</dt>
                  <dd>
                    {title} · Google Meet{googleInvite ? " · Kalendereinladung an den Gast" : ""}
                  </dd>
                  {ctx.asanaConfigured && toAsana ? (
                    <>
                      <dt className="text-fg-muted">Asana</dt>
                      <dd>Aufgabe wird angelegt</dd>
                    </>
                  ) : null}
                  <dt className="text-fg-muted">Anhänge</dt>
                  <dd>
                    <AttachmentList attachments={ctx.attachments} ids={attachmentIds} />
                  </dd>
                  <dt className="text-fg-muted">Danach</dt>
                  <dd className="text-fg-muted">Status „Termin gebucht“, Wiedervorlage am Termintag, Eintrag im Verlauf</dd>
                </dl>
                <MailPreview subject={rs.text} body={rb.text} />
              </div>
            ) : null}

            {error ? <p className="text-[13px] text-[var(--tone-red-fg)]">{error}</p> : null}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button size="sm" onClick={onClose}>
              Schließen
            </Button>
          ) : (
            <>
              {step > 0 ? (
                <Button variant="secondary" size="sm" className="mr-auto" onClick={() => { setError(null); setStep(step - 1); }} disabled={pending}>
                  <ChevronLeft /> Zurück
                </Button>
              ) : (
                <Button variant="secondary" size="sm" className="mr-auto" onClick={onClose}>
                  Abbrechen
                </Button>
              )}
              {step < 3 ? (
                <Button
                  size="sm"
                  disabled={pending || !stepValid[step]}
                  onClick={() => {
                    setError(null);
                    if (step === 0) saveContactThenNext();
                    else setStep(step + 1);
                  }}
                >
                  {pending ? "Speichert…" : step === 0 && contactChanged ? "Speichern & weiter" : "Weiter"}
                  <ChevronRight />
                </Button>
              ) : (
                <Button size="sm" disabled={pending} onClick={send}>
                  <Send />
                  {pending ? "Lege Termin an…" : "Jetzt senden"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full border text-[11px] font-medium",
              i < step && "border-accent bg-accent text-white",
              i === step && "border-accent text-accent-fg",
              i > step && "border-line-strong text-fg-subtle",
            )}
          >
            {i < step ? <Check className="size-3" /> : i + 1}
          </span>
          <span className={cn(i === step ? "font-medium text-fg" : "text-fg-muted")}>{label}</span>
          {i < STEPS.length - 1 ? <span className="h-px w-5 bg-line-strong" /> : null}
        </li>
      ))}
    </ol>
  );
}

function MailPreview({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="max-h-72 min-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-surface-2/60 px-3 py-2 text-[13px] leading-relaxed">
      <div className="mb-2 font-medium">{subject}</div>
      {body.replace("{{meetlink}}", "https://meet.google.com/… (wird beim Senden erzeugt)")}
    </div>
  );
}

function StepContact({
  people,
  contact,
  setContact,
}: {
  people: Person[];
  contact: ContactDraft;
  setContact: (c: ContactDraft) => void;
}) {
  const isNew = contact.id === null;
  return (
    <div className="grid gap-3">
      {people.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setContact(draftFrom(p))}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-[13px]",
                contact.id === p.id ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2",
              )}
            >
              {p.ist_entscheider ? <Star className="size-3 fill-accent text-accent" /> : null}
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-fg-subtle">{p.email ?? "keine E-Mail"}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setContact(draftFrom(null))}
            className={cn(
              "flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1.5 text-[13px]",
              isNew ? "border-accent bg-accent-soft" : "border-line-strong text-fg-muted hover:text-fg",
            )}
          >
            <Plus className="size-3.5" /> Neuer Ansprechpartner
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-fg-muted">Noch kein Ansprechpartner hinterlegt. Lege ihn hier an.</p>
      )}

      <div className="grid gap-3 rounded-md border border-line px-3 py-3 sm:grid-cols-2">
        <Field label="Name *" htmlFor="inv-c-name">
          <Input id="inv-c-name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
        </Field>
        <Field label="Rolle" htmlFor="inv-c-rolle">
          <Input id="inv-c-rolle" value={contact.rolle} placeholder="Inhaber" onChange={(e) => setContact({ ...contact, rolle: e.target.value })} />
        </Field>
        <Field label="E-Mail *" htmlFor="inv-c-email">
          <Input
            id="inv-c-email"
            type="email"
            value={contact.email}
            placeholder="name@firma.de"
            onChange={(e) => setContact({ ...contact, email: e.target.value })}
          />
        </Field>
        <Field label="Telefon" htmlFor="inv-c-tel">
          <Input id="inv-c-tel" value={contact.telefon} onChange={(e) => setContact({ ...contact, telefon: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Kontext" htmlFor="inv-c-kontext">
            <Textarea
              id="inv-c-kontext"
              rows={2}
              maxLength={4000}
              value={contact.kontext}
              placeholder="z. B. Inhaber, 50+, will Zahlen sehen, lieber Telefon als Mail"
              onChange={(e) => setContact({ ...contact, kontext: e.target.value })}
            />
          </Field>
        </div>
      </div>
      {contact.email && !EMAIL_RE.test(contact.email.trim()) ? (
        <p className="text-xs text-[var(--tone-red-fg)]">Bitte eine gültige E-Mail-Adresse eintragen.</p>
      ) : null}
    </div>
  );
}
