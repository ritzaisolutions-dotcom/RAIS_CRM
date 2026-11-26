"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { publicBaseUrl } from "@/lib/publicUrl";
import { asanaConfigured, createAsanaTask } from "@/lib/integrations/asana";
import { safeDatabaseError, validationError } from "@/lib/sales/validation";

/**
 * Terminvorschläge per E-Mail.
 *
 * Slots kommen aus der Edge Function `booking-availability` (eigene
 * Verfügbarkeit − Buchungen − Google-Busy-Zeiten). Pro Mail entsteht eine
 * Einladung in `sales.booking_invites`; der Lead bucht über `/termin/<token>`,
 * die Edge Function `booking-invite` prüft und bucht.
 */

const EVENT_SLUG = "erstgespraech";

export type ProposalSlot = { startsAt: string; endsAt: string; label: string };

function functionsUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt");
  return `${base.replace(/\/$/, "")}/functions/v1/${path}`;
}

function functionHeaders(): HeadersInit {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" };
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

export async function fetchProposalSlots(): Promise<
  { ok: true; slots: ProposalSlot[]; gcalSynced: boolean } | { error: string }
> {
  if (!(await requireUser())) return { error: "Nicht angemeldet." };
  try {
    const res = await fetch(`${functionsUrl("booking-availability")}?event=${EVENT_SLUG}`, {
      headers: functionHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return { error: `Verfügbarkeit nicht abrufbar (${res.status}).` };
    const json = (await res.json()) as { slots?: ProposalSlot[]; gcalSynced?: boolean };
    return { ok: true, slots: json.slots ?? [], gcalSynced: Boolean(json.gcalSynced) };
  } catch {
    return { error: "Verfügbarkeit nicht abrufbar." };
  }
}

const slotSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  label: z.string().max(80),
});

const BERLIN_FMT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Legt die Einladung an und liefert den fertigen Textblock für die Mail. */
export async function createBookingInvite(input: {
  companyId: string;
  personId: string | null;
  slots: ProposalSlot[];
}): Promise<{ ok: true; token: string; block: string } | { error: string }> {
  const parsed = z
    .object({
      companyId: z.string().uuid(),
      personId: z.string().uuid().nullable(),
      slots: z.array(slotSchema).min(1).max(5),
    })
    .safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await requireUser();
  if (!supabase) return { error: "Nicht angemeldet." };

  const slots = [...parsed.data.slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const { data, error } = await supabase
    .from("booking_invites")
    .insert({
      company_id: parsed.data.companyId,
      person_id: parsed.data.personId,
      event_slug: EVENT_SLUG,
      slots: slots.map(({ startsAt, endsAt }) => ({ startsAt, endsAt })),
      // Gültig bis zum letzten vorgeschlagenen Termin.
      expires_at: slots[slots.length - 1].startsAt,
    })
    .select("token")
    .single();
  if (error || !data) return { error: safeDatabaseError(error, "create-booking-invite") };

  const base = await publicBaseUrl();
  const block = slots
    .map((s, i) => {
      const when = BERLIN_FMT.format(new Date(s.startsAt)).replace(",", "");
      return `• ${when} Uhr\n  ${base}/termin/${data.token}?s=${i}`;
    })
    .join("\n");
  return { ok: true, token: data.token, block };
}

/* ---------------- Öffentliche Seite /termin/[token] ---------------- */

export type InviteView =
  | {
      state: "open";
      company: string;
      firstName: string | null;
      event: { title: string; durationMin: number };
      slots: (ProposalSlot & { available: boolean })[];
    }
  | {
      state: "booked";
      company: string;
      firstName: string | null;
      event: { title: string; durationMin: number };
      bookedLabel: string | null;
    }
  | {
      state: "expired";
      company: string;
      firstName: string | null;
      event: { title: string; durationMin: number };
    }
  | { state: "not_found" };

const tokenSchema = z.string().regex(/^[a-f0-9]{32,80}$/);

export async function loadInvite(token: string): Promise<InviteView> {
  if (!tokenSchema.safeParse(token).success) return { state: "not_found" };
  try {
    const res = await fetch(
      `${functionsUrl("booking-invite")}?token=${encodeURIComponent(token)}`,
      { headers: functionHeaders(), cache: "no-store" },
    );
    if (res.status === 404) return { state: "not_found" };
    if (!res.ok) return { state: "not_found" };
    return (await res.json()) as InviteView;
  } catch {
    return { state: "not_found" };
  }
}

export async function bookInviteSlot(
  token: string,
  startsAt: string,
): Promise<{ ok: true; label: string | null } | { error: string }> {
  if (!tokenSchema.safeParse(token).success) return { error: "Link ungültig." };
  if (!z.string().datetime({ offset: true }).safeParse(startsAt).success) {
    return { error: "Termin ungültig." };
  }
  try {
    const res = await fetch(functionsUrl("booking-invite"), {
      method: "POST",
      headers: functionHeaders(),
      body: JSON.stringify({ token, startsAt }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      bookedLabel?: string | null;
      company?: string;
      companyId?: string;
      contactName?: string;
      contactEmail?: string | null;
      startsAt?: string;
      event?: { title: string; durationMin: number };
    };
    if (res.ok) {
      // Terminvergabe → Aufgabe in Asana (falls verbunden). Fehler hier
      // dürfen die Buchung für den Lead nicht kippen.
      if (asanaConfigured() && json.companyId && json.startsAt) {
        try {
          const base = await publicBaseUrl();
          await createAsanaTask({
            name: `Termin: ${json.company ?? "Lead"}${json.bookedLabel ? ` – ${json.bookedLabel} Uhr` : ""}`,
            dueAt: json.startsAt,
            notes: [
              `${json.event?.title ?? "Erstgespräch"} (${json.event?.durationMin ?? 45} Min.), selbst gebucht über Terminvorschlag.`,
              "",
              `Lead: ${json.company ?? ""}`,
              json.contactName ? `Kontakt: ${json.contactName}` : null,
              json.contactEmail ? `E-Mail: ${json.contactEmail}` : null,
              "",
              `Im CRM: ${base}/firma/${json.companyId}`,
            ]
              .filter((l) => l !== null)
              .join("\n"),
          });
        } catch (e) {
          console.error("asana_after_booking", e);
        }
      }
      return { ok: true, label: json.bookedLabel ?? null };
    }
    if (json.error === "slot_taken") {
      return { error: "Dieser Termin ist leider gerade vergeben worden. Bitte wählen Sie einen anderen." };
    }
    if (json.error === "already_booked") return { error: "Über diesen Link wurde bereits ein Termin gebucht." };
    return { error: "Die Buchung hat nicht geklappt. Bitte versuchen Sie es erneut." };
  } catch {
    return { error: "Die Buchung hat nicht geklappt. Bitte versuchen Sie es erneut." };
  }
}
