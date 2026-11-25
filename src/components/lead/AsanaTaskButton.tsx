"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExternalLink, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { createAsanaTaskForLead } from "@/lib/sales/assistActions";
import { addBusinessDays, businessToday } from "@/lib/sales/dates";

/** Aufgabe zum Lead in Asana anlegen (Projekt RAIS, dir zugewiesen). */
export function AsanaTaskButton({
  companyId,
  companyName,
  configured,
}: {
  companyId: string;
  companyName: string;
  configured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setTitle(`${companyName}: nachfassen`);
    setDue(addBusinessDays(businessToday(), 1));
    setNote("");
    setError(null);
    setDone(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        title={configured ? "Aufgabe in Asana anlegen" : "Asana ist noch nicht verbunden"}
      >
        <ListTodo />
        Asana
      </Button>
      <DialogContent title="Aufgabe in Asana" description="Projekt RAIS, dir zugewiesen. Lead-Daten und CRM-Link stehen automatisch in der Beschreibung.">
        {!configured ? (
          <p className="rounded-md bg-[var(--tone-yellow-bg)] px-3 py-2 text-[13px] text-[var(--tone-yellow-fg)]">
            Asana ist noch nicht verbunden: <code>ASANA_ACCESS_TOKEN</code> fehlt in den
            Umgebungsvariablen (lokal <code>.env.local</code>, live in Vercel).
          </p>
        ) : done !== null ? (
          <div className="space-y-2 text-[13px]">
            <p className="font-medium text-[var(--tone-green-fg)]">Aufgabe angelegt.</p>
            {done ? (
              <a href={done} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent-fg hover:underline">
                In Asana öffnen <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
        ) : (
          <form
            id="asana-form"
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await createAsanaTaskForLead({
                  companyId,
                  title,
                  dueOn: due || null,
                  note: note || null,
                });
                if (res.error) {
                  setError(res.error);
                  return;
                }
                setDone(res.url ?? "");
                router.refresh();
              });
            }}
          >
            <Field label="Titel" htmlFor="asana-title">
              <Input id="asana-title" autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Fällig am" htmlFor="asana-due">
              <Input id="asana-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="max-w-44" />
            </Field>
            <Field label="Notiz (optional)" htmlFor="asana-note">
              <Textarea id="asana-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {error ? <p className="text-[13px] text-[var(--tone-red-fg)]">{error}</p> : null}
          </form>
        )}
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {done !== null ? "Schließen" : "Abbrechen"}
          </Button>
          {configured && done === null ? (
            <Button size="sm" type="submit" form="asana-form" disabled={pending || !title.trim()}>
              {pending ? "Lege an…" : "In Asana anlegen"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
