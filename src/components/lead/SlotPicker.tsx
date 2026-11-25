"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarPlus, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  createBookingInvite,
  fetchProposalSlots,
  type ProposalSlot,
} from "@/lib/booking/invites";
import { cn } from "@/lib/utils";

const MAX = 3;
const dayFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Wählt bis zu drei freie Slots und legt eine Buchungs-Einladung an.
 * Ergebnis ist der Textblock für {{terminvorschlaege}}.
 */
export function SlotPicker({
  companyId,
  personId,
  onInsert,
  hasBlock,
}: {
  companyId: string;
  personId: string | null;
  onInsert: (block: string) => void;
  hasBlock: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<ProposalSlot[] | null>(null);
  const [gcal, setGcal] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  function load() {
    startLoad(async () => {
      const res = await fetchProposalSlots();
      if ("error" in res) {
        setError(res.error);
        setSlots([]);
        return;
      }
      setError(null);
      setSlots(res.slots);
      setGcal(res.gcalSynced);
    });
  }

  // Beim Öffnen laden (egal ob über den Button oder Tastatur geöffnet).
  useEffect(() => {
    if (open && slots === null && !loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(startsAt: string) {
    setPicked((p) =>
      p.includes(startsAt)
        ? p.filter((x) => x !== startsAt)
        : p.length >= MAX
          ? p
          : [...p, startsAt],
    );
  }

  // Nach Tag gruppieren, die nächsten 10 Tage mit freien Slots.
  const days: { day: string; slots: ProposalSlot[] }[] = [];
  for (const s of slots ?? []) {
    const day = dayFmt.format(new Date(s.startsAt));
    const last = days[days.length - 1];
    if (last && last.day === day) last.slots.push(s);
    else if (days.length < 10) days.push({ day, slots: [s] });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPicked([]);
      }}
    >
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus />
        {hasBlock ? "Termine ändern" : "Termine vorschlagen"}
      </Button>
      <DialogContent
        title="Termine vorschlagen"
        description={`Bis zu ${MAX} freie Termine wählen. Der Lead bekommt pro Termin einen Buchungslink.`}
        className="max-w-xl"
      >
        {!gcal ? (
          <p className="mb-3 flex items-start gap-2 rounded-md bg-[var(--tone-yellow-bg)] px-3 py-2 text-xs text-[var(--tone-yellow-fg)]">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            Google Kalender ist noch nicht verbunden. Die Slots berücksichtigen nur deine
            Verfügbarkeit und bestehende Buchungen, nicht deine Kalendertermine.
          </p>
        ) : null}
        {loading || slots === null ? (
          <p className="py-6 text-center text-[13px] text-fg-muted">Lade freie Termine…</p>
        ) : days.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-fg-muted">
            {error ?? "Keine freien Termine in den nächsten Wochen. Verfügbarkeit unter Buchung prüfen."}
          </p>
        ) : (
          <div className="grid gap-3">
            {days.map((d) => (
              <div key={d.day}>
                <div className="mb-1.5 text-xs font-medium text-fg-muted">{d.day}</div>
                <div className="flex flex-wrap gap-1.5">
                  {d.slots.map((s) => {
                    const on = picked.includes(s.startsAt);
                    const full = !on && picked.length >= MAX;
                    return (
                      <button
                        key={s.startsAt}
                        type="button"
                        disabled={full}
                        onClick={() => toggle(s.startsAt)}
                        className={cn(
                          "h-7 rounded-md border px-2.5 text-[13px] tabular-nums transition-colors",
                          on
                            ? "border-accent bg-accent-soft font-medium text-accent-fg"
                            : "border-line-strong text-fg hover:bg-surface-2",
                          full && "opacity-40",
                        )}
                      >
                        {timeFmt.format(new Date(s.startsAt))}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {error && days.length > 0 ? (
          <p className="mt-3 text-[13px] text-[var(--tone-red-fg)]">{error}</p>
        ) : null}
        <DialogFooter>
          <span className="mr-auto text-xs text-fg-muted">
            {picked.length} / {MAX} gewählt
          </span>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button
            size="sm"
            disabled={picked.length === 0 || saving}
            onClick={() =>
              startSave(async () => {
                const chosen = (slots ?? []).filter((s) => picked.includes(s.startsAt));
                const res = await createBookingInvite({ companyId, personId, slots: chosen });
                if ("error" in res) {
                  setError(res.error);
                  return;
                }
                onInsert(res.block);
                setOpen(false);
                setPicked([]);
              })
            }
          >
            {saving ? "Erstelle Links…" : "In E-Mail einfügen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
