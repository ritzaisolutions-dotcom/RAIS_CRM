"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { draftEmailWithAI } from "@/lib/sales/assistActions";

const QUICK = [
  "Erstkontakt: kurz vorstellen, nach Anruf nicht erreicht",
  "Nachfassen, freundlich und kurz",
  "Zusammenfassung nach unserem Gespräch mit nächstem Schritt",
  "Termin für ein Erstgespräch vorschlagen",
  "Tür offen lassen nach Absage",
];

/**
 * KI-Entwurf: schreibt Betreff + Text aus dem ganzen Lead-Kontext
 * (Persona, Notizen, Verlauf, Recherche). Ist schon Text da, wird er überarbeitet.
 */
export function AiDraftButton({
  companyId,
  personId,
  subject,
  body,
  withSlots,
  senderName,
  onDraft,
}: {
  companyId: string;
  personId: string | null;
  subject: string;
  body: string;
  withSlots: boolean;
  senderName: string | null;
  onDraft: (d: { subject: string; body: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const revising = Boolean(subject.trim() || body.trim());

  function run(text: string) {
    start(async () => {
      const res = await draftEmailWithAI({
        companyId,
        personId,
        instruction: text,
        currentSubject: subject,
        currentBody: body,
        withSlots,
        senderName,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      onDraft({ subject: res.subject!, body: res.body! });
      setOpen(false);
      setInstruction("");
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Sparkles className="text-accent" />
          {revising ? "Mit KI überarbeiten" : "KI-Entwurf"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start" side="top">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(instruction);
          }}
        >
          <p className="text-xs font-medium text-fg-muted">
            {revising ? "Was soll an der Mail besser werden?" : "Was soll die Mail erreichen?"}
          </p>
          <Textarea
            autoFocus
            rows={3}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                run(instruction);
              }
            }}
            placeholder={revising ? "z. B. kürzer, lockerer, Bezug auf sein Team nehmen" : "z. B. nach dem Anruf von heute nachfassen"}
          />
          {!revising ? (
            <div className="flex flex-wrap gap-1">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={pending}
                  onClick={() => run(q)}
                  className="rounded border border-line-strong px-1.5 py-0.5 text-left text-[11px] text-fg-muted hover:bg-surface-2 hover:text-fg"
                >
                  {q}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-[11px] text-fg-subtle">
            Nutzt Persona, Notizen, Verlauf und Recherche des Leads. Bitte vor dem Senden lesen.
          </p>
          {error ? <p className="text-xs text-[var(--tone-red-fg)]">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              <Sparkles />
              {pending ? "Schreibt…" : revising ? "Überarbeiten" : "Entwurf schreiben"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
