"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarPlus, CircleAlert, ExternalLink, Send, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { AiDraftButton } from "@/components/lead/AiDraftButton";
import { fetchBusyForDay, sendCalendarInvite } from "@/lib/sales/inviteActions";
import { addBusinessDays, businessToday } from "@/lib/sales/dates";
import { buildTemplateContext, renderTemplate } from "@/lib/sales/templateVars";
import type { Person } from "@/lib/sales/types";
import { cn } from "@/lib/utils";

const BERLIN = "Europe/Berlin";
const DURATIONS = [15, 30, 45, 60];
const TIMES = Array.from({ length: (20 - 7) * 4 + 1 }, (_, i) => {
  const m = 7 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

/** Berliner Wandzeit (YYYY-MM-DD + HH:MM) → ISO-Zeitpunkt, sommerzeitsicher. */
function berlinToIso(day: string, time: string): string {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const shown = new Intl.DateTimeFormat("en-GB", {
    timeZone: BERLIN,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(guess);
  const [sh, sm] = shown.split(":").map(Number);
  const delta = (h * 60 + mi - ((sh % 24) * 60 + sm)) * 60_000;
  return new Date(guess.getTime() + delta).toISOString();
}

const labelFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: BERLIN,
  weekday: "long",
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
const hm = new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN, hour: "2-digit", minute: "2-digit" });

const DEFAULT_SUBJECT = "Unser Gespräch am {{termin}}";
const DEFAULT_BODY = `Hallo {{vorname|zusammen}},

wie besprochen habe ich uns einen Termin eingetragen:

{{termin}}
Google Meet: {{meetlink}}

Sie bekommen zusätzlich eine Kalendereinladung. Falls der Termin doch nicht passt, antworten Sie einfach kurz auf diese Mail.

Viele Grüße
{{absender|Kevin Ritz}}`;

export function InviteDialog({
  companyId,
  companyName,
  stadt,
  website,
  people,
  senderName,
  asanaConfigured,
}: {
  companyId: string;
  companyName: string;
  stadt: string | null;
  website: string | null;
  people: Person[];
  senderName: string | null;
  asanaConfigured: boolean;
}) {
  const router = useRouter();
  const withEmail = people.filter((p) => p.email);
  const firstPerson = withEmail.find((p) => p.ist_entscheider) ?? withEmail[0] ?? null;

  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(() => addBusinessDays(businessToday(), 1));
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [personId, setPersonId] = useState(firstPerson?.id ?? "");
  const [to, setTo] = useState(firstPerson?.email ?? "");
  const [title, setTitle] = useState(`Erstgespräch RAIS × ${companyName}`);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [googleInvite, setGoogleInvite] = useState(true);
  const [toAsana, setToAsana] = useState(true);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<{ start: string; end: string }[] | null>(null);
  const [busyError, setBusyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ meetLink: string | null; htmlLink: string | null; warning?: string } | null>(null);
  const [pending, start] = useTransition();

  const person = people.find((p) => p.id === personId) ?? null;
  const startsAt = useMemo(() => berlinToIso(day, time), [day, time]);
  const endsAt = useMemo(() => new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString(), [startsAt, duration]);
  const whenLabel = `${labelFmt.format(new Date(startsAt))} Uhr`;

  // Belegte Zeiten des gewählten Tages aus Google laden.
  useEffect(() => {
    if (!open) return;
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
  }, [day, open]);

  const conflict = (busy ?? []).some((b) => new Date(b.start) < new Date(endsAt) && new Date(b.end) > new Date(startsAt));

  const ctx = {
    ...buildTemplateContext({ personName: person?.name, firma: companyName, stadt, website, absender: senderName }),
    termin: whenLabel,
    meetlink: "{{meetlink}}",
  };
  const rs = renderTemplate(subject, ctx);
  const rb = renderTemplate(body, ctx);
  const missing = [...new Set([...rs.missing, ...rb.missing])];
  const unknown = [...new Set([...rs.unknown, ...rb.unknown])];
  const hasMeet = body.includes("{{meetlink}}");

  function reset() {
    setDay(addBusinessDays(businessToday(), 1));
    setTime("10:00");
    setDuration(30);
    setSubject(DEFAULT_SUBJECT);
    setBody(DEFAULT_BODY);
    setPreview(false);
    setError(null);
    setResult(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <CalendarPlus />
        Termin einladen
      </Button>
      <DialogContent
        title="Termin einladen"
        description="Termin im Google-Kalender mit Google Meet anlegen und Einladung per E-Mail senden."
        className="max-w-2xl"
      >
        {result ? (
          <div className="space-y-3 text-[13px]">
            <p className="font-medium text-[var(--tone-green-fg)]">
              Einladung gesendet: {whenLabel}
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
          <form
            id="invite-form"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (missing.length || unknown.length) return;
              start(async () => {
                const res = await sendCalendarInvite({
                  companyId,
                  personId: personId || null,
                  toEmail: to,
                  attendeeName: person?.name ?? null,
                  startsAt,
                  durationMin: duration,
                  title,
                  subject: rs.text,
                  body: rb.text,
                  sendGoogleInvite: googleInvite,
                  toAsana: asanaConfigured && toAsana,
                });
                if ("error" in res) {
                  setError(res.error);
                  return;
                }
                setError(null);
                setResult({ meetLink: res.meetLink, htmlLink: res.htmlLink, warning: res.warning });
                router.refresh();
              });
            }}
          >
            {/* Zeitpunkt */}
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem_auto]">
              <Field label="Datum" htmlFor="inv-day">
                <Input id="inv-day" type="date" required min={businessToday()} value={day} onChange={(e) => setDay(e.target.value)} />
              </Field>
              <Field label="Uhrzeit" htmlFor="inv-time">
                <NativeSelect id="inv-time" value={time} onChange={(e) => setTime(e.target.value)}>
                  {TIMES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Dauer">
                <div className="flex h-8 gap-1">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuration(d)}
                      className={cn(
                        "rounded-md border px-2 text-xs",
                        d === duration ? "border-accent bg-accent-soft font-medium text-accent-fg" : "border-line-strong text-fg-muted hover:bg-surface-2",
                      )}
                    >
                      {d} Min.
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <div className="rounded-md border border-line bg-surface-2/50 px-3 py-2 text-xs">
              {busy === null ? (
                <span className="text-fg-subtle">Prüfe deinen Kalender…</span>
              ) : busyError ? (
                <span className="text-[var(--tone-yellow-fg)]">{busyError}</span>
              ) : busy.length === 0 ? (
                <span className="text-[var(--tone-green-fg)]">An diesem Tag ist dein Kalender frei.</span>
              ) : (
                <span className="text-fg-muted">
                  Belegt: {busy.map((b) => `${hm.format(new Date(b.start))}–${hm.format(new Date(b.end))}`).join(", ")}
                </span>
              )}
              {conflict ? (
                <span className="mt-1 flex items-center gap-1 font-medium text-[var(--tone-red-fg)]">
                  <CircleAlert className="size-3.5" /> Überschneidet sich mit einem bestehenden Termin.
                </span>
              ) : null}
            </div>

            {/* Empfänger + Titel */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="An" htmlFor="inv-to">
                {withEmail.length > 0 ? (
                  <NativeSelect
                    id="inv-to"
                    value={personId}
                    onChange={(e) => {
                      setPersonId(e.target.value);
                      setTo(people.find((p) => p.id === e.target.value)?.email ?? "");
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
                  <Input type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="empfaenger@firma.de" className="mt-1" />
                ) : null}
              </Field>
              <Field label="Titel im Kalender" htmlFor="inv-title">
                <Input id="inv-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
            </div>

            {/* E-Mail */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-fg-muted">E-Mail</span>
                <div className="flex gap-1.5">
                  <AiDraftButton
                    companyId={companyId}
                    personId={personId || null}
                    subject={subject}
                    body={body}
                    withSlots={false}
                    senderName={senderName}
                    requiredPlaceholders={["termin", "meetlink"]}
                    extraContext={`Termin-Einladung: ${whenLabel}, ${duration} Minuten, per Google Meet. Der Meet-Link wird beim Senden automatisch eingesetzt.`}
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
                <div className="min-h-44 whitespace-pre-wrap rounded-md border border-line bg-surface-2/60 px-3 py-2 text-[13px] leading-relaxed">
                  <div className="mb-2 font-medium">{rs.text}</div>
                  {rb.text.replace("{{meetlink}}", "https://meet.google.com/… (wird beim Senden erzeugt)")}
                </div>
              ) : (
                <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} required />
              )}
              {!hasMeet ? (
                <p className="text-xs text-[var(--tone-yellow-fg)]">
                  Tipp: <code>{"{{meetlink}}"}</code> einfügen, dann steht der Meet-Link in der Mail (er ist ohnehin in der Kalendereinladung).
                </p>
              ) : null}
              {missing.length || unknown.length ? (
                <p className="text-xs text-[var(--tone-red-fg)]">
                  {missing.length ? `Fehlende Werte: ${missing.map((m) => `{{${m}}}`).join(", ")}. ` : ""}
                  {unknown.length ? `Unbekannt: ${unknown.map((m) => `{{${m}}}`).join(", ")}.` : ""}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={googleInvite} onChange={(e) => setGoogleInvite(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                Zusätzlich Google-Kalendereinladung senden
              </label>
              {asanaConfigured ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={toAsana} onChange={(e) => setToAsana(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                  Aufgabe in Asana anlegen
                </label>
              ) : null}
            </div>
            {error ? <p className="text-[13px] text-[var(--tone-red-fg)]">{error}</p> : null}
          </form>
        )}
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {result ? "Schließen" : "Abbrechen"}
          </Button>
          {!result ? (
            <Button
              size="sm"
              type="submit"
              form="invite-form"
              disabled={pending || !to || missing.length > 0 || unknown.length > 0}
            >
              <Send />
              {pending ? "Lege Termin an…" : "Einladung senden"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
