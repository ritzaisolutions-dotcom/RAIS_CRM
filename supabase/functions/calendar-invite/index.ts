// Termin aus dem CRM direkt im Google-Kalender anlegen – immer mit Google Meet.
//
// POST { action: "busy", from, to }              → belegte Zeiten (zur Anzeige)
// POST { action: "events", from, to }            → Termine (max. 45 Tage) für /plan
// POST { action: "create", title, description, startsAt, endsAt,
//        attendeeEmail, attendeeName, sendGoogleInvite } → Event + Meet-Link
//
// Nur für angemeldete CRM-Nutzer: der Aufrufer (Next.js-Server) schickt das
// Access-Token des Nutzers; ohne gültigen Nutzer → 401.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

let tokenCache: { token: string; exp: number } | null = null;

function env(name: string) {
  return Deno.env.get(name)?.trim() ?? "";
}

function gcalConfigured() {
  return Boolean(
    env("GOOGLE_CALENDAR_CLIENT_ID") && env("GOOGLE_CALENDAR_CLIENT_SECRET") &&
      env("GOOGLE_CALENDAR_REFRESH_TOKEN"),
  );
}

async function gToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: env("GOOGLE_CALENDAR_CLIENT_SECRET"),
      refresh_token: env("GOOGLE_CALENDAR_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`gcal_token_failed:${res.status}`);
  const j = await res.json() as { access_token: string; expires_in?: number };
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CALENDAR_ID = () => env("GOOGLE_CALENDAR_ID") || "primary";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // Nur angemeldete Nutzer (User-JWT im Header x-user-token).
  const userToken = req.headers.get("x-user-token")?.trim() ?? "";
  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  if (!userToken || !url || !anon) return json(401, { error: "unauthorized" });
  const { data: userData, error: userErr } = await createClient(url, anon).auth.getUser(userToken);
  if (userErr || !userData?.user) return json(401, { error: "unauthorized" });

  if (!gcalConfigured()) return json(503, { error: "gcal_not_configured" });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? "");

  try {
    if (action === "busy") {
      const from = new Date(String(body.from));
      const to = new Date(String(body.to));
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
        return json(400, { error: "invalid_range" });
      }
      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { Authorization: `Bearer ${await gToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: CALENDAR_ID() }] }),
      });
      if (!res.ok) return json(502, { error: `gcal_freebusy_failed:${res.status}` });
      const j = await res.json() as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> };
      return json(200, { busy: j.calendars?.[CALENDAR_ID()]?.busy ?? [] });
    }

    if (action === "events") {
      const from = new Date(String(body.from));
      const to = new Date(String(body.to));
      if (
        Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from ||
        to.getTime() - from.getTime() > 45 * 86_400_000
      ) {
        return json(400, { error: "invalid_range" });
      }
      const params = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID())}/events?${params}`,
        { headers: { Authorization: `Bearer ${await gToken()}` } },
      );
      if (!res.ok) return json(502, { error: `gcal_list_failed:${res.status}` });
      type GEvent = {
        id: string;
        status?: string;
        summary?: string;
        htmlLink?: string;
        hangoutLink?: string;
        transparency?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        attendees?: { email?: string; self?: boolean; responseStatus?: string }[];
        conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
      };
      const j = await res.json() as { items?: GEvent[] };
      const events = (j.items ?? [])
        .filter((e) => e.status !== "cancelled")
        .map((e) => ({
          id: e.id,
          title: e.summary ?? "(ohne Titel)",
          start: e.start?.dateTime ?? e.start?.date ?? null,
          end: e.end?.dateTime ?? e.end?.date ?? null,
          allDay: !e.start?.dateTime,
          free: e.transparency === "transparent",
          htmlLink: e.htmlLink ?? null,
          meetLink: e.hangoutLink ??
            e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null,
          attendees: (e.attendees ?? [])
            .filter((a) => !a.self && a.email)
            .map((a) => ({ email: a.email!.toLowerCase(), response: a.responseStatus ?? null })),
        }));
      return json(200, { events });
    }

    if (action === "create") {
      const title = String(body.title ?? "").trim().slice(0, 200);
      const description = String(body.description ?? "").slice(0, 4000);
      const startsAt = new Date(String(body.startsAt));
      const endsAt = new Date(String(body.endsAt));
      const attendeeEmail = String(body.attendeeEmail ?? "").trim().toLowerCase();
      const attendeeName = String(body.attendeeName ?? "").trim();
      const sendGoogleInvite = body.sendGoogleInvite !== false;
      if (!title || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        return json(400, { error: "invalid_event" });
      }
      if (attendeeEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(attendeeEmail)) {
        return json(400, { error: "invalid_email" });
      }

      const params = new URLSearchParams({
        conferenceDataVersion: "1",
        sendUpdates: sendGoogleInvite && attendeeEmail ? "all" : "none",
      });
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID())}/events?${params}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${await gToken()}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: title,
            description,
            start: { dateTime: startsAt.toISOString(), timeZone: "Europe/Berlin" },
            end: { dateTime: endsAt.toISOString(), timeZone: "Europe/Berlin" },
            attendees: attendeeEmail ? [{ email: attendeeEmail, displayName: attendeeName || undefined }] : [],
            conferenceData: {
              createRequest: {
                requestId: crypto.randomUUID(),
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
            reminders: { useDefault: true },
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        console.error("gcal_insert", res.status, text.slice(0, 300));
        return json(502, { error: `gcal_insert_failed:${res.status}` });
      }
      const ev = await res.json() as {
        id: string;
        htmlLink?: string;
        hangoutLink?: string;
        conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
      };
      const meetLink = ev.hangoutLink ??
        ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ?? null;
      return json(200, { eventId: ev.id, htmlLink: ev.htmlLink ?? null, meetLink });
    }

    return json(400, { error: "unknown_action" });
  } catch (e) {
    console.error(e);
    return json(500, { error: "internal" });
  }
});
