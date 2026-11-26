"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { findSimilarCompanies, type SimilarCompany } from "@/lib/sales/actions";
import { createLead } from "@/lib/sales/leadActions";
import { LEAD_QUELLEN, LEAD_QUELLE_LABELS, type LeadQuelle } from "@/lib/sales/types";

const EMPTY = {
  name: "",
  stadt: "",
  quelle: "manuell" as LeadQuelle,
  person_name: "",
  person_email: "",
  person_telefon: "",
  telefon: "",
  website: "",
  linkedin_url: "",
  instagram_url: "",
  facebook_url: "",
};

export function CreateLeadDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [similar, setSimilar] = useState<SimilarCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Dubletten-Hinweis während der Eingabe (Firmen lassen sich nicht löschen).
  useEffect(() => {
    const name = form.name.trim();
    if (name.length < 3) {
      setSimilar([]);
      return;
    }
    const t = setTimeout(async () => {
      setSimilar(await findSimilarCompanies(name));
    }, 300);
    return () => clearTimeout(t);
  }, [form.name]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setForm(EMPTY);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus />
            Lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title="Neuer Lead" description="Nur die Firma ist Pflicht.">
        <form
          id="create-lead"
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await createLead(form);
              if (res.error) {
                setError(res.error);
                return;
              }
              setOpen(false);
              setForm(EMPTY);
              router.push(`/firma/${res.companyId}`);
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <Field label="Firma *" htmlFor="cl-name">
              <Input
                id="cl-name"
                autoFocus
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Muster Immobilien GmbH"
              />
            </Field>
            <Field label="Stadt" htmlFor="cl-stadt">
              <Input id="cl-stadt" value={form.stadt} onChange={(e) => set("stadt", e.target.value)} />
            </Field>
          </div>
          {similar.length > 0 ? (
            <div className="rounded-md bg-[var(--tone-yellow-bg)] px-3 py-2 text-xs text-[var(--tone-yellow-fg)]">
              Ähnliche Leads existieren bereits:{" "}
              {similar.map((s, i) => (
                <span key={s.id}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/firma/${s.id}`} className="font-medium underline">
                    {s.name}
                    {s.stadt ? ` (${s.stadt})` : ""}
                  </Link>
                </span>
              ))}
            </div>
          ) : null}
          <Field label="Quelle" htmlFor="cl-quelle">
            <NativeSelect
              id="cl-quelle"
              value={form.quelle}
              onChange={(e) => set("quelle", e.target.value as LeadQuelle)}
            >
              {LEAD_QUELLEN.map((q) => (
                <option key={q} value={q}>
                  {LEAD_QUELLE_LABELS[q]}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <div className="mt-1 border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            Ansprechpartner
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="cl-person">
              <Input id="cl-person" value={form.person_name} onChange={(e) => set("person_name", e.target.value)} />
            </Field>
            <Field label="E-Mail" htmlFor="cl-email">
              <Input
                id="cl-email"
                type="email"
                value={form.person_email}
                onChange={(e) => set("person_email", e.target.value)}
              />
            </Field>
            <Field label="Telefon (Person)" htmlFor="cl-ptel">
              <Input id="cl-ptel" value={form.person_telefon} onChange={(e) => set("person_telefon", e.target.value)} />
            </Field>
            <Field label="Telefon (Zentrale)" htmlFor="cl-tel">
              <Input id="cl-tel" value={form.telefon} onChange={(e) => set("telefon", e.target.value)} />
            </Field>
          </div>

          <div className="mt-1 border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            Web &amp; Social
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Website" htmlFor="cl-web">
              <Input id="cl-web" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="muster-immo.de" />
            </Field>
            <Field label="LinkedIn" htmlFor="cl-li">
              <Input id="cl-li" value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} />
            </Field>
            <Field label="Instagram" htmlFor="cl-ig">
              <Input id="cl-ig" value={form.instagram_url} onChange={(e) => set("instagram_url", e.target.value)} />
            </Field>
            <Field label="Facebook" htmlFor="cl-fb">
              <Input id="cl-fb" value={form.facebook_url} onChange={(e) => set("facebook_url", e.target.value)} />
            </Field>
          </div>
          {error ? <p className="text-[13px] text-[var(--tone-red-fg)]">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button variant="secondary" size="sm" type="button" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button size="sm" type="submit" form="create-lead" disabled={pending || !form.name.trim()}>
            Lead anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
