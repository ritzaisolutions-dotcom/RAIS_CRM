// Terminvorschläge aus dem CRM buchen.
//
// GET  ?token=…            → Einladung + Slots (je Slot: noch frei?)
// POST { token, startsAt } → bucht den Slot für genau diesen Lead
//
// Gleiche Regeln wie `booking-book` (Verfügbarkeitsfenster, Blackouts,
// bestehende Buchungen, Holds, Google FreeBusy), aber ohne Fragebogen:
// Name/E-Mail kommen aus dem CRM-Lead. Nach der Buchung: Lead-Status
// „Termin gebucht“ + Touch im CRM, Google-Event (falls verbunden),
// Bestätigungsmail via Resend (falls konfiguriert).
//
// Aufrufer ist der Next.js-Server (kein Browser-Origin). Browser-Requests
// werden nur von erlaubten Origins akzeptiert.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const BERLIN = "Europe/Berlin";

type Interval = { start: Date; end: Date };
type EventType = {
  id: string;
  slug: string;
  title: string;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_hours: number;
  timezone: string;
  gcal_calendar_id: string;
};
type Window = { weekday: number; start_time: string; end_time: string };
type Invite = {
  id: string;
  token: string;
  company_id: string;
  person_id: string | null;
  event_slug: string;
  slots: { startsAt: string; endsAt: string }[];
  expires_at: string;
  booked_at: string | null;
  booked_starts_at: string | null;
};

/* ---------------- Zeit-Helfer (wie booking-core) ---------------- */

function berlinParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: BERLIN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const wd: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    y: Number(p.year),
    m: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour === "24" ? "0" : p.hour),
    min: Number(p.minute),
    weekday: wd[p.weekday] ?? 1,
  };
}

const toMin = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};
const overlaps = (a: Interval, b: Interval) => a.start < b.end && a.end > b.start;
const padded = (i: Interval, et: EventType): Interval => ({
  start: new Date(i.start.getTime() - et.buffer_before_min * 60_000),
  end: new Date(i.end.getTime() + et.buffer_after_min * 60_000),
});

function fitsWindows(et: EventType, windows: Window[], s: Date, e: Date, now: Date) {
  if (!(s < e)) return false;
  if (Math.abs(s.getTime() + et.duration_min * 60_000 - e.getTime()) > 60_000) return false;
  if (s.getTime() < now.getTime() + et.min_notice_hours * 3600_000) return false;
  const a = berlinParts(s);
  const b = berlinParts(e);
  if (a.y !== b.y || a.m !== b.m || a.day !== b.day) return false;
  const sm = a.hour * 60 + a.min;
  const em = b.hour * 60 + b.min;
  return windows
    .filter((w) => w.weekday === a.weekday)
    .some((w) => sm >= toMin(w.start_time) && em <= toMin(w.end_time));
}

function label(d: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/* ---------------- Google (Refresh-Token, wie booking-gcal) ---------------- */

let tokenCache: { token: string; exp: number } | null = null;

function gcalConfigured() {
  return Boolean(
    Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")?.trim() &&
      Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")?.trim() &&
      Deno.env.get("GOOGLE_CALENDAR_REFRESH_TOKEN")?.trim(),
  );
}

async function gToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")!.trim(),
      client_secret: Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")!.trim(),
      refresh_token: Deno.env.get("GOOGLE_CALENDAR_REFRESH_TOKEN")!.trim(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`gcal_token_failed:${res.status}`);
  const j = await res.json() as { access_token: string; expires_in?: number };
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

async function freeBusy(calendarId: string, from: Date, to: Date): Promise<Interval[]> {
  if (!gcalConfigured()) return [];
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${await gToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: calendarId }] }),
  });
  if (!res.ok) throw new Error(`gcal_freebusy_failed:${res.status}`);
  const j = await res.json() as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> };
  return (j.calendars?.[calendarId]?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

async function createEvent(input: {
  calendarId: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
  email: string;
  name: string;
  tz: string;
}): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events?sendUpdates=all`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${await gToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.start.toISOString(), timeZone: input.tz },
        end: { dateTime: input.end.toISOString(), timeZone: input.tz },
        attendees: [{ email: input.email, displayName: input.name || undefined }],
      }),
    },
  );
  if (!res.ok) throw new Error(`gcal_insert_failed:${res.status}`);
  const j = await res.json() as { id?: string };
  if (!j.id) throw new Error("gcal_insert_no_id");
  return j.id;
}

/* ---------------- HTTP ---------------- */

const ALLOWED = new Set(
  (Deno.env.get("RAIS_ALLOWED_ORIGINS") ??
    "https://ritz-ai.solutions,https://www.ritz-ai.solutions")
    .split(",").map((o) => o.trim()).filter(Boolean),
);
function originOk(origin: string | null) {
  if (!origin) return true; // Server-zu-Server (Next.js)
  if (ALLOWED.has(origin)) return true;
  try {
    const h = new URL(origin).hostname;
    return h === "localhost" || h === "127.0.0.1";
  } catch {
    return false;
  }
}
function json(status: number, body: unknown, origin: string | null) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && originOk(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    const r = json(200, null, origin);
    return new Response(null, { status: 204, headers: r.headers });
  }
  if (!originOk(origin)) return json(403, { error: "origin_forbidden" }, origin);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return json(500, { error: "server_misconfigured" }, origin);
  const pub = createClient(url, key);
  const sales = createClient(url, key, { db: { schema: "sales" } });

  let token = "";
  let startsAtRaw = "";
  if (req.method === "GET") {
    token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  } else if (req.method === "POST") {
    const body = await req.json().catch(() => ({})) as { token?: string; startsAt?: string };
    token = String(body.token ?? "").trim();
    startsAtRaw = String(body.startsAt ?? "").trim();
  } else {
    return json(405, { error: "method_not_allowed" }, origin);
  }
  if (!/^[a-f0-9]{32,80}$/.test(token)) return json(404, { error: "invite_not_found" }, origin);

  const { data: inviteRow } = await sales.from("booking_invites").select("*").eq("token", token).maybeSingle();
  const invite = inviteRow as Invite | null;
  if (!invite) return json(404, { error: "invite_not_found" }, origin);

  const [{ data: company }, { data: person }] = await Promise.all([
    sales.from("companies").select("id,name,relationship").eq("id", invite.company_id).maybeSingle(),
    invite.person_id
      ? sales.from("people").select("id,name,email").eq("id", invite.person_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const { data: etRow } = await pub.from("booking_event_types").select("*").eq("slug", invite.event_slug).eq("active", true).maybeSingle();
  const et = etRow as EventType | null;
  if (!company || !et) return json(404, { error: "invite_not_found" }, origin);

  const firstName = String(person?.name ?? "").trim().split(/\s+/).filter((p) => !/^(herr|frau|dr\.?)$/i.test(p))[0] ?? null;
  const base = {
    company: company.name,
    firstName,
    event: { title: et.title, durationMin: et.duration_min },
  };

  if (invite.booked_at) {
    return json(200, {
      ...base,
      state: "booked",
      bookedLabel: invite.booked_starts_at ? label(new Date(invite.booked_starts_at)) : null,
    }, origin);
  }
  if (new Date(invite.expires_at) < new Date()) {
    return json(200, { ...base, state: "expired" }, origin);
  }

  const now = new Date();
  const slots = invite.slots
    .map((s) => ({ start: new Date(s.startsAt), end: new Date(s.endsAt) }))
    .filter((s) => !Number.isNaN(s.start.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const from = slots[0]?.start ?? now;
  const to = slots[slots.length - 1]?.end ?? now;

  const [{ data: windows }, { data: blackouts }, { data: bookings }, { data: holds }] = await Promise.all([
    pub.from("booking_availability").select("weekday,start_time,end_time").eq("event_type_id", et.id).eq("active", true),
    pub.from("booking_blackouts").select("starts_at,ends_at").eq("event_type_id", et.id),
    pub.from("bookings").select("starts_at,ends_at").eq("event_type_id", et.id).in("status", ["confirmed", "sync_failed"]).lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString()),
    pub.from("booking_holds").select("starts_at,ends_at").eq("event_type_id", et.id).gt("expires_at", now.toISOString()),
  ]);
  const busy: Interval[] = [
    ...(blackouts ?? []).map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) })),
    ...(bookings ?? []).map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) })),
    ...(holds ?? []).map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) })),
  ];
  let gBusy: Interval[] = [];
  try {
    gBusy = await freeBusy(et.gcal_calendar_id || "primary", from, to);
  } catch (e) {
    console.error("freebusy", e);
  }
  const isFree = (s: Interval) =>
    fitsWindows(et, (windows ?? []) as Window[], s.start, s.end, now) &&
    ![...busy, ...gBusy].some((b) => overlaps(padded(s, et), b));

  if (req.method === "GET") {
    return json(200, {
      ...base,
      state: "open",
      slots: slots.map((s) => ({
        startsAt: s.start.toISOString(),
        endsAt: s.end.toISOString(),
        label: label(s.start),
        available: isFree(s),
      })),
    }, origin);
  }

  /* ---------- POST: buchen ---------- */
  const chosen = slots.find((s) => s.start.toISOString() === new Date(startsAtRaw).toISOString());
  if (!chosen) return json(400, { error: "slot_not_in_invite" }, origin);
  if (!isFree(chosen)) return json(409, { error: "slot_taken" }, origin);

  const email = String(person?.email ?? "").trim().toLowerCase();
  const name = String(person?.name ?? company.name).trim();

  const holdToken = crypto.randomUUID();
  const { error: holdErr } = await pub.rpc("claim_booking_hold", {
    p_event_type_id: et.id,
    p_starts_at: chosen.start.toISOString(),
    p_ends_at: chosen.end.toISOString(),
    p_hold_token: holdToken,
    p_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  if (holdErr) return json(409, { error: "slot_taken" }, origin);

  try {
    const { data: booking, error: bookErr } = await pub.from("bookings").insert({
      event_type_id: et.id,
      status: "confirmed",
      starts_at: chosen.start.toISOString(),
      ends_at: chosen.end.toISOString(),
      timezone: et.timezone,
      name,
      email: email || null,
      answers: { firma: company.name, crm_company_id: company.id },
      rule_outcome: "proceed",
      source: "crm-invite",
      idempotency_key: `crm-invite:${invite.id}`,
    }).select("id").single();
    if (bookErr || !booking) {
      const msg = String(bookErr?.message ?? "");
      if (msg.includes("booking_slot_taken")) return json(409, { error: "slot_taken" }, origin);
      if (msg.includes("duplicate key")) return json(409, { error: "already_booked" }, origin);
      console.error(bookErr);
      return json(500, { error: "persist_failed" }, origin);
    }

    const when = label(chosen.start);
    await sales.from("booking_invites").update({
      booked_at: new Date().toISOString(),
      booked_starts_at: chosen.start.toISOString(),
      booking_id: booking.id,
    }).eq("id", invite.id);

    // CRM: Status + Touch. Kunden bleiben Kunden.
    if (company.relationship === "Prospect") {
      const { error } = await sales.from("companies").update({ pipeline_status: "set_appointment" }).eq("id", company.id);
      if (error) console.error("crm_status", error);
    }
    const termDay = new Intl.DateTimeFormat("en-CA", { timeZone: BERLIN }).format(chosen.start);
    const { error: touchErr } = await sales.rpc("log_touch", {
      p_company_id: company.id,
      p_kanal: "meeting",
      p_ergebnis: "termin_gebucht",
      p_person_id: invite.person_id,
      p_notiz: `Termin selbst gebucht über Terminvorschlag: ${when}`,
      p_naechster: termDay,
      p_abbruch: null,
      p_source_key: `crm-invite:${invite.id}`,
    });
    if (touchErr) console.error("crm_touch", touchErr);

    let gcalSynced = false;
    if (gcalConfigured() && email) {
      try {
        const id = await createEvent({
          calendarId: et.gcal_calendar_id || "primary",
          summary: `${et.title}: ${company.name}`,
          description: `Gebucht über CRM-Terminvorschlag\nFirma: ${company.name}\nKontakt: ${name}\nE-Mail: ${email}`,
          start: chosen.start,
          end: chosen.end,
          email,
          name,
          tz: et.timezone,
        });
        await pub.from("bookings").update({ gcal_event_id: id }).eq("id", booking.id);
        gcalSynced = true;
      } catch (e) {
        console.error("gcal", e);
        await pub.from("bookings").update({ status: "sync_failed" }).eq("id", booking.id);
      }
    }

    const resend = Deno.env.get("RESEND_API_KEY")?.trim();
    if (resend) {
      const from = Deno.env.get("BOOKING_MAIL_FROM")?.trim() || "RAIS <kevin@ritz-ai.solutions>";
      const internal = Deno.env.get("BOOKING_MAIL_INTERNAL")?.trim() || "kevin@ritz-ai.solutions";
      const send = (to: string, subject: string, html: string) =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [to], subject, html }),
        }).catch((e) => console.error("resend", e));
      const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
      await Promise.all([
        email
          ? send(email, `Bestätigung: ${et.title} am ${when}`, `<p>Hallo ${esc(firstName ?? name)},</p><p>danke — unser Termin ist bestätigt: <strong>${esc(when)} Uhr</strong> (${et.duration_min} Minuten).</p><p>Viele Grüße<br>RAIS</p>`)
          : Promise.resolve(),
        send(internal, `CRM-Termin gebucht: ${company.name}`, `<p>${esc(company.name)} (${esc(name)}) hat gebucht: <strong>${esc(when)}</strong>.</p>`),
      ]);
    }

    return json(200, {
      ...base,
      state: "booked",
      bookedLabel: when,
      gcalSynced,
      // Für Folgeaktionen im CRM-Server (z. B. Asana-Aufgabe).
      companyId: company.id,
      contactName: name,
      contactEmail: email || null,
      startsAt: chosen.start.toISOString(),
      endsAt: chosen.end.toISOString(),
    }, origin);
  } finally {
    await pub.from("booking_holds").delete().eq("hold_token", holdToken);
  }
});
