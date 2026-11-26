"use client";

import { useState, useTransition } from "react";
import { bookInviteSlot, type InviteView } from "@/lib/booking/invites";

type Open = Extract<InviteView, { state: "open" }>;
type Booked = Extract<InviteView, { state: "booked" }>;

/**
 * Auswahl + Bestätigung. Bewusst kein Buchen beim Öffnen des Links:
 * Mail-Scanner rufen Links automatisch auf und würden sonst Termine belegen.
 */
export function InviteBooking({
  token,
  view,
  preselect,
}: {
  token: string;
  view: Open | Booked;
  preselect: number | null;
}) {
  const initial =
    view.state === "open" && preselect !== null && view.slots[preselect]?.available
      ? view.slots[preselect].startsAt
      : null;
  const [chosen, setChosen] = useState<string | null>(initial);
  const [booked, setBooked] = useState<string | null>(
    view.state === "booked" ? (view.bookedLabel ?? "") : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const greeting = view.firstName ? `Hallo ${view.firstName},` : "Hallo,";

  if (booked !== null) {
    return (
      <div>
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-[#E3F3E7] text-lg text-[#1D6B3A]">
          ✓
        </div>
        <h1 className="text-lg font-semibold">Termin bestätigt</h1>
        <p className="mt-2 text-sm leading-relaxed">
          {booked ? (
            <>
              <strong>{booked} Uhr</strong> · {view.event.title} ({view.event.durationMin} Min.)
            </>
          ) : (
            "Ihr Termin ist gebucht."
          )}
        </p>
        <p className="mt-2 text-sm text-[#7B746B]">
          Sie erhalten zusätzlich eine Bestätigung per E-Mail. Ich freue mich auf das Gespräch.
        </p>
      </div>
    );
  }

  const open = view as Open;
  const anyFree = open.slots.some((s) => s.available);

  return (
    <div>
      <p className="text-sm text-[#7B746B]">{greeting}</p>
      <h1 className="mt-1 text-lg font-semibold leading-snug">
        Welcher Termin passt Ihnen für unser {open.event.title.replace(/ mit RAIS$/, "")}?
      </h1>
      <p className="mt-1 text-sm text-[#7B746B]">{open.event.durationMin} Minuten · Zeiten in deutscher Zeit</p>

      <div className="mt-5 grid gap-2">
        {open.slots.map((s) => {
          const on = chosen === s.startsAt;
          return (
            <button
              key={s.startsAt}
              type="button"
              disabled={!s.available || pending}
              onClick={() => setChosen(s.startsAt)}
              className={[
                "flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                on
                  ? "border-[#EC6A37] bg-[#FDEEE7] font-medium"
                  : "border-[#D9D1C7] bg-white hover:border-[#7B746B]",
                !s.available ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              <span>{s.label} Uhr</span>
              {!s.available ? (
                <span className="text-xs text-[#7B746B]">nicht mehr frei</span>
              ) : on ? (
                <span className="text-xs text-[#B4481F]">ausgewählt</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-3 text-sm text-[#A3291C]">{error}</p> : null}

      {anyFree ? (
        <button
          type="button"
          disabled={!chosen || pending}
          onClick={() =>
            chosen &&
            start(async () => {
              const res = await bookInviteSlot(token, chosen);
              if ("error" in res) {
                setError(res.error);
                return;
              }
              setError(null);
              setBooked(res.label ?? "");
            })
          }
          className="mt-5 h-11 w-full rounded-lg bg-[#EC6A37] text-sm font-semibold text-white transition-colors hover:bg-[#F37A48] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Wird gebucht…" : chosen ? "Termin verbindlich buchen" : "Bitte einen Termin wählen"}
        </button>
      ) : (
        <p className="mt-5 text-sm text-[#7B746B]">
          Diese Termine sind inzwischen vergeben. Antworten Sie kurz auf die E-Mail, dann schicke
          ich neue Vorschläge.
        </p>
      )}
    </div>
  );
}
