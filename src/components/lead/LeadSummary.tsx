"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { PhoneOff, Plus, StickyNote, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/menu";
import { FollowUpPicker } from "@/components/leads/LeadBits";
import { insertTouchpoint, setListPipelineStatus } from "@/lib/sales/actions";
import { setLeadPersona } from "@/lib/sales/leadActions";
import { BUSINESS_TZ } from "@/lib/sales/dates";
import {
  kontaktwegLabel,
  nichtErreichtCount,
  relativePast,
  resolveStatusChoice,
} from "@/lib/sales/leads";
import type { PipelineStatus, Touchpoint } from "@/lib/sales/types";
import { cn } from "@/lib/utils";

const stamp = new Intl.DateTimeFormat("de-DE", {
  timeZone: BUSINESS_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Einträge, die echten Kontext tragen (keine Auto-Notizen wie Status/Wiedervorlage). */
function isContextNote(t: Touchpoint): boolean {
  if (t.voided_at) return false;
  const n = t.notiz?.trim();
  if (!n) return false;
  if (n.startsWith("Pipeline → ") || n.startsWith("Wiedervorlage → ")) return false;
  if (n.startsWith("Click-to-Call gestartet")) return false;
  return t.kanal === "note" || t.kanal === "call" || t.kanal === "meeting" || t.kanal === "dm";
}

function StatBox({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-4 py-3", className)}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
        {label}
      </div>
      {children}
    </div>
  );
}

export function LeadSummary({
  companyId,
  status,
  nextTouch,
  contactCount,
  lastContactAt,
  persona,
  touchpoints,
  mainPersonId,
}: {
  companyId: string;
  status: PipelineStatus;
  nextTouch: string | null;
  contactCount: number;
  lastContactAt: string | null;
  persona: string | null;
  touchpoints: Touchpoint[];
  mainPersonId: string | null;
}) {
  const router = useRouter();
  const [bumpPending, startBump] = useTransition();
  const misses = nichtErreichtCount(status);
  // Anrufe aus der Notion-Zeit stehen nur im Status („Nicht erreicht 2“), nicht als Touchpoint.
  const baseCount = Math.max(contactCount, misses);
  const [count, setCount] = useState(baseCount);
  const [bumpError, setBumpError] = useState<string | null>(null);

  useEffect(() => setCount(baseCount), [baseCount]);

  const notes = touchpoints.filter(isContextNote);
  const [showAll, setShowAll] = useState(false);
  const visibleNotes = showAll ? notes : notes.slice(0, 4);
  const contactTouches = touchpoints.filter(
    (t) => !t.voided_at && ["call", "email", "dm", "sms", "meeting"].includes(t.kanal),
  );
  const way = kontaktwegLabel(contactTouches[0]?.kanal, contactTouches[1]?.kanal);

  function bumpNotReached() {
    setCount((c) => c + 1);
    startBump(async () => {
      const res = await setListPipelineStatus({
        companyId,
        pipelineStatus: resolveStatusChoice("kein_anschluss_1", status),
        kanal: "call",
      });
      if (res.error) {
        setCount((c) => c - 1);
        setBumpError(res.error);
        return;
      }
      setBumpError(null);
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      {/* Kennzahlen */}
      <div className="grid grid-cols-1 divide-y divide-line border-b border-line md:grid-cols-3 md:divide-x md:divide-y-0">
        <StatBox label="Wiedervorlage">
          <FollowUpPicker companyId={companyId} date={nextTouch} personId={mainPersonId} variant="field" />
        </StatBox>
        <StatBox label="Kontakte gesamt">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-xl font-semibold tabular-nums leading-none">{count}</span>
              <span className="ml-1.5 text-xs text-fg-muted">
                {count === 1 ? "Kontakt" : "Kontakte"}
                {misses > 0 ? ` · ${misses}× nicht erreicht` : ""}
              </span>
            </div>
            <Tooltip content="Angerufen, nicht erreicht: zählt +1 und setzt den Status hoch">
              <Button
                variant="secondary"
                size="sm"
                disabled={bumpPending}
                onClick={bumpNotReached}
                aria-label="Nicht erreicht, +1"
              >
                <PhoneOff />
                +1
              </Button>
            </Tooltip>
          </div>
          {way ? (
            <p className={cn("mt-1.5 text-xs", way.changed ? "font-medium text-accent-fg" : "text-fg-muted")}>
              Kontaktweg: {way.label}
              {way.changed ? " (gewechselt)" : ""}
            </p>
          ) : null}
          {bumpError ? (
            <p className="mt-1 text-xs text-[var(--tone-red-fg)]">{bumpError}</p>
          ) : null}
        </StatBox>
        <StatBox label="Letzter Kontakt">
          <span className="text-[13px] font-medium">{relativePast(lastContactAt)}</span>
          {lastContactAt ? (
            <span className="ml-1.5 text-xs text-fg-subtle">
              {stamp.format(new Date(lastContactAt))}
            </span>
          ) : null}
        </StatBox>
      </div>

      <div className="grid divide-y divide-line 2xl:grid-cols-2 2xl:divide-x 2xl:divide-y-0">
        <PersonaBox companyId={companyId} persona={persona} />

        {/* Notizen-Verlauf */}
        <div className="min-w-0 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
              <StickyNote className="size-3" />
              Notizen
              {notes.length ? <span className="font-normal normal-case">· {notes.length}</span> : null}
            </h3>
          </div>
          <QuickNote companyId={companyId} personId={mainPersonId} />
          {notes.length === 0 ? (
            <p className="mt-3 text-[13px] text-fg-subtle">
              Noch keine Notizen. Alles, was du hier notierst, bleibt mit Datum und Uhrzeit erhalten.
            </p>
          ) : (
            <ol className="mt-3 space-y-2.5">
              {visibleNotes.map((t) => (
                <li key={t.id} className="border-l-2 border-line-strong pl-2.5">
                  <div className="text-[11px] tabular-nums text-fg-subtle">
                    {stamp.format(new Date(t.occurred_at))}
                    {t.kanal !== "note" ? ` · ${t.kanal === "call" ? "Anruf" : t.kanal === "dm" ? "DM" : "Meeting"}` : ""}
                  </div>
                  <p className="line-clamp-4 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                    {t.notiz?.replace(/^Anruf: /, "")}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {notes.length > 4 ? (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="mt-2 text-xs font-medium text-fg-muted hover:text-fg"
            >
              {showAll ? "Weniger anzeigen" : `Alle ${notes.length} Notizen`}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PersonaBox({ companyId, persona }: { companyId: string; persona: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(persona ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setValue(persona ?? "");
  }, [persona, editing]);

  return (
    <div className="min-w-0 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
          <UserRound className="size-3" />
          Persona
        </h3>
        {!editing && persona ? (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-fg-muted hover:text-fg">
            Bearbeiten
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            rows={6}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={"Wer ist das? Wie tickt er/sie?\nz. B. Inhaber, 50+, skeptisch bei Technik, will Zahlen sehen, lieber Telefon als Mail."}
          />
          {error ? <p className="text-xs text-[var(--tone-red-fg)]">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setValue(persona ?? "");
                setEditing(false);
                setError(null);
              }}
            >
              Abbrechen
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await setLeadPersona({ companyId, persona: value.trim() || null });
                  if (res.error) {
                    setError(res.error);
                    return;
                  }
                  setError(null);
                  setEditing(false);
                  router.refresh();
                })
              }
            >
              Speichern
            </Button>
          </div>
        </div>
      ) : persona ? (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{persona}</p>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex w-full items-center gap-2 rounded-md border border-dashed border-line-strong px-3 py-3 text-left text-[13px] text-fg-subtle hover:border-fg-subtle hover:text-fg-muted"
        >
          <Plus className="size-3.5" />
          Kontext zur Persona ergänzen: Rolle, Haltung, was ihm wichtig ist
        </button>
      )}
    </div>
  );
}

function QuickNote({ companyId, personId }: { companyId: string; personId: string | null }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    const v = text.trim();
    if (!v) return;
    start(async () => {
      const res = await insertTouchpoint({
        company_id: companyId,
        person_id: personId,
        kanal: "note",
        ergebnis: "kein_ergebnis",
        notiz: v,
        naechster_touch: null,
        abbruchgrund: null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setText("");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex gap-2">
        <Textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
          placeholder="Notiz hinzufügen … (Enter speichert)"
          className="min-h-8 resize-none py-1.5"
        />
        <Button size="sm" variant="secondary" disabled={pending || !text.trim()} onClick={save}>
          Speichern
        </Button>
      </div>
      {error ? <p className="mt-1 text-xs text-[var(--tone-red-fg)]">{error}</p> : null}
    </div>
  );
}
