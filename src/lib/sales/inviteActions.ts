"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { asanaConfigured, createAsanaTask } from "@/lib/integrations/asana";
import { publicBaseUrl } from "@/lib/publicUrl";
import { sendCompanyEmail } from "@/lib/sales/actions";
import { validationError } from "@/lib/sales/validation";
import { businessDayStart } from "@/lib/sales/dates";
import type { CalendarEvent } from "@/lib/sales/plan";

/**
 * „Termin einladen“: du wählst Datum/Uhrzeit, das CRM legt den Termin im
 * Google-Kalender an (immer mit Google Meet), schickt deine Mail mit dem
 * Meet-Link, setzt den Lead auf „Termin gebucht“ und protokolliert alles.
 */

const BERLIN = "Europe/Berlin";

function functionsUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt");
  return `${base.replace(/\/$/, "")}/functions/v1/calendar-invite`;
}

async function callCalendar(body: Record<string, unknown>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, json: { error: "unauthorized" } as Record<string, unknown> };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const res = await fetch(functionsUrl(), {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "x-user-token": session?.access_token ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

/** Belegte Zeiten eines Tages (Berlin) aus Google – nur zur Anzeige. */
export async function fetchBusyForDay(
  day: string,
): Promise<{ ok: true; busy: { start: string; end: string }[] } | { error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Ungültiges Datum." };
  // Großzügiges Fenster um den Kalendertag (Zeitzonen-sicher).
  const from = new Date(`${day}T00:00:00+01:00`);
  from.setHours(from.getHours() - 2);
  const to = new Date(`${day}T23:59:59+01:00`);
  to.setHours(to.getHours() + 2);
  try {
    const { status, json } = await callCalendar({ action: "busy", from: from.toISOString(), to: to.toISOString() });
    if (status === 503) return { error: "Google Kalender ist nicht verbunden." };
    if (status !== 200) return { error: "Kalender nicht abrufbar." };
    return { ok: true, busy: (json.busy as { start: string; end: string }[]) ?? [] };
  } catch {
    return { error: "Kalender nicht abrufbar." };
  }
}

export type PlanEvent = CalendarEvent & {
  /** Lead, dessen Kontaktperson als Teilnehmer eingetragen ist. */
  lead: { companyId: string; firma: string; person: string } | null;
};

/**
 * Termine aus dem Google-Kalender für /plan, inkl. Zuordnung zum Lead über
 * die Teilnehmer-E-Mail. Liefert `error` statt zu werfen, damit die Seite den
 * Rest (Wiedervorlagen, Aufgaben) trotzdem zeigt.
 */
export async function fetchPlanEvents(
  fromYmd: string,
  toYmdExclusive: string,
): Promise<{ events: PlanEvent[] } | { error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmdExclusive)) {
    return { error: "Ungültiger Zeitraum." };
  }
  let events: CalendarEvent[];
  try {
    const { status, json } = await callCalendar({
      action: "events",
      from: businessDayStart(fromYmd).toISOString(),
      to: businessDayStart(toYmdExclusive).toISOString(),
    });
    if (status === 503) return { error: "Google Kalender ist nicht verbunden." };
    if (status === 400 && json.error === "unknown_action") {
      return { error: "Die Kalender-Funktion ist noch nicht aktualisiert (Aktion „events“ fehlt)." };
    }
    if (status !== 200) return { error: "Kalender nicht abrufbar." };
    events = (json.events as CalendarEvent[]) ?? [];
  } catch {
    return { error: "Kalender nicht abrufbar." };
  }

  const emails = [...new Set(events.flatMap((e) => e.attendees.map((a) => a.email)))];
  const byEmail = new Map<string, { companyId: string; firma: string; person: string }>();
  if (emails.length > 0) {
    const supabase = await createClient();
    const { data: people } = await supabase
      .from("people")
      .select("email,name,company_id")
      .in("email", emails.slice(0, 300));
    const companyIds = [...new Set((people ?? []).map((p) => p.company_id as string))];
    const { data: companies } = companyIds.length
      ? await supabase.from("companies").select("id,name").in("id", companyIds)
      : { data: [] as { id: string; name: string }[] };
    const firmaById = new Map((companies ?? []).map((c) => [c.id as string, c.name as string]));
    for (const p of people ?? []) {
      const firma = firmaById.get(p.company_id as string);
      if (p.email && firma) {
        byEmail.set(String(p.email).toLowerCase(), {
          companyId: p.company_id as string,
          firma,
          person: p.name as string,
        });
      }
    }
  }

  return {
    events: events.map((e) => ({
      ...e,
      lead: e.attendees.map((a) => byEmail.get(a.email)).find(Boolean) ?? null,
    })),
  };
}

const inviteSchema = z.object({
  companyId: z.string().uuid(),
  personId: z.string().uuid().nullable(),
  toEmail: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben."),
  attendeeName: z.string().max(160).nullable(),
  startsAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(10).max(240),
  title: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(10000),
  sendGoogleInvite: z.boolean(),
  toAsana: z.boolean(),
});

const labelFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: BERLIN,
  weekday: "long",
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export async function sendCalendarInvite(
  input: z.input<typeof inviteSchema>,
): Promise<
  | { ok: true; meetLink: string | null; htmlLink: string | null; emailStatus: string; warning?: string }
  | { error: string }
> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const d = parsed.data;

  const start = new Date(d.startsAt);
  if (start.getTime() < Date.now() - 5 * 60_000) return { error: "Der Termin liegt in der Vergangenheit." };
  const end = new Date(start.getTime() + d.durationMin * 60_000);
  const when = labelFmt.format(start);

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id,name,relationship,pipeline_status")
    .eq("id", d.companyId)
    .maybeSingle();
  if (!company) return { error: "Lead nicht gefunden." };

  // 1) Google-Termin mit Meet
  const cal = await callCalendar({
    action: "create",
    title: d.title,
    description: `${d.title}\nGoogle Meet: Link in der Einladung.\n\nRAIS – Ritz AI Solutions`,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    attendeeEmail: d.toEmail,
    attendeeName: d.attendeeName ?? "",
    sendGoogleInvite: d.sendGoogleInvite,
  });
  if (cal.status === 503) return { error: "Google Kalender ist nicht verbunden." };
  if (cal.status !== 200) return { error: "Der Kalendertermin konnte nicht angelegt werden." };
  const meetLink = (cal.json.meetLink as string | null) ?? null;
  const htmlLink = (cal.json.htmlLink as string | null) ?? null;

  // 2) Mail mit echtem Link
  const fill = (s: string) =>
    s
      .replace(/\{\{\s*meetlink\s*(\|[^}]*)?\}\}/gi, meetLink ?? "(Link folgt in der Kalendereinladung)")
      .replace(/\{\{\s*termin\s*(\|[^}]*)?\}\}/gi, `${when} Uhr`);
  const mail = await sendCompanyEmail({
    company_id: d.companyId,
    person_id: d.personId,
    to_email: d.toEmail,
    subject: fill(d.subject),
    body: fill(d.body),
  });
  const emailStatus = mail.error ? "failed" : (mail.status ?? "queued");

  // 3) Verlauf: Termin-Eintrag mit Meet-Link, Wiedervorlage = Termintag
  const termDay = new Intl.DateTimeFormat("en-CA", { timeZone: BERLIN }).format(start);
  await supabase.rpc("log_touch", {
    p_company_id: d.companyId,
    p_kanal: "meeting",
    p_ergebnis: "termin_gebucht",
    p_person_id: d.personId,
    p_notiz: `Termin eingeladen: ${when} Uhr (${d.durationMin} Min.)${meetLink ? `\nGoogle Meet: ${meetLink}` : ""}${htmlLink ? `\nKalender: ${htmlLink}` : ""}`,
    p_naechster: termDay,
    p_abbruch: null,
  });

  // 4) Status → Termin gebucht (Kunden bleiben Kunden)
  if (
    company.relationship === "Prospect" &&
    !["set_appointment", "closed"].includes(company.pipeline_status as string)
  ) {
    await supabase.rpc("set_pipeline_status", {
      p_company_id: d.companyId,
      p_pipeline_status: "set_appointment",
      p_kanal: "status_change",
      p_naechster_touch: termDay,
    });
  }

  // 5) Asana (optional)
  let warning: string | undefined;
  if (d.toAsana && asanaConfigured()) {
    const base = await publicBaseUrl();
    const a = await createAsanaTask({
      name: `Termin: ${company.name} – ${when} Uhr`,
      dueAt: start.toISOString(),
      notes: [
        `${d.title} (${d.durationMin} Min.)`,
        meetLink ? `Google Meet: ${meetLink}` : null,
        `Kontakt: ${d.attendeeName ?? ""} <${d.toEmail}>`,
        "",
        `Im CRM: ${base}/firma/${d.companyId}`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
    });
    if ("error" in a) warning = `Asana: ${a.error}`;
  }
  if (mail.error) warning = `Termin angelegt, aber die E-Mail ging nicht raus: ${mail.error}`;

  revalidatePath(`/firma/${d.companyId}`);
  revalidatePath("/leads");
  return { ok: true as const, meetLink, htmlLink, emailStatus, warning };
}
