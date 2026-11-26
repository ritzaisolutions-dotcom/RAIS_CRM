"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Copy, Ellipsis, Mail, Pencil, Phone, Plus, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from "@/components/ui/menu";
import { SectionLabel } from "@/components/ui/panel";
import { LinkedinIcon } from "@/components/leads/BrandIcons";
import { deletePerson, logClickToCall, upsertPerson } from "@/lib/sales/actions";
import { normalizeUrl } from "@/lib/sales/leads";
import { placeCallHref } from "@/lib/sales/placeCall";
import type { Person } from "@/lib/sales/types";

type Draft = {
  id?: string;
  name: string;
  rolle: string;
  email: string;
  telefon: string;
  linkedin_url: string;
  ist_entscheider: boolean;
  kontext: string;
};

const EMPTY: Draft = {
  name: "",
  rolle: "",
  email: "",
  telefon: "",
  linkedin_url: "",
  ist_entscheider: false,
  kontext: "",
};

export function ContactsSection({
  companyId,
  people,
  onEmail,
}: {
  companyId: string;
  people: Person[];
  onEmail: (personId: string) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [focusField, setFocusField] = useState("ct-name");

  // Beim Öffnen gezielt ins fehlende Feld springen (z. B. „+ Telefon“).
  const dialogOpen = draft !== null;
  useEffect(() => {
    if (!dialogOpen) return;
    const t = setTimeout(() => document.getElementById(focusField)?.focus(), 50);
    return () => clearTimeout(t);
  }, [dialogOpen, focusField]);
  const [pending, start] = useTransition();

  function open(p?: Person, focusId?: string) {
    setError(null);
    setFocusField(focusId ?? "ct-name");
    setDraft(
      p
        ? {
            id: p.id,
            name: p.name,
            rolle: p.rolle ?? "",
            email: p.email ?? "",
            telefon: p.telefon ?? "",
            linkedin_url: p.linkedin_url ?? "",
            ist_entscheider: p.ist_entscheider,
            kontext: p.kontext ?? "",
          }
        : { ...EMPTY, ist_entscheider: people.length === 0 },
    );
  }

  function save() {
    if (!draft) return;
    start(async () => {
      const res = await upsertPerson({
        id: draft.id,
        company_id: companyId,
        name: draft.name,
        rolle: draft.rolle || null,
        email: draft.email || null,
        telefon: draft.telefon || null,
        linkedin_url: draft.linkedin_url || null,
        ist_entscheider: draft.ist_entscheider,
        kontext: draft.kontext.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* Zwischenablage nicht verfügbar */
    }
  }

  return (
    <section className="space-y-2">
      <SectionLabel
        action={
          <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => open()}>
            <Plus />
            Kontakt
          </Button>
        }
      >
        Ansprechpartner
      </SectionLabel>

      {people.length === 0 ? (
        <button
          type="button"
          onClick={() => open()}
          className="w-full rounded-md border border-dashed border-line-strong px-3 py-3 text-[13px] text-fg-subtle hover:border-fg-subtle hover:text-fg-muted"
        >
          Noch kein Ansprechpartner — hinzufügen
        </button>
      ) : (
        <ul className="space-y-2">
          {people.map((p) => (
            <li key={p.id} className="rounded-md border border-line bg-surface px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => open(p)}
                  className="min-w-0 text-left"
                  title="Kontakt bearbeiten"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium hover:underline">{p.name}</span>
                    {p.ist_entscheider ? (
                      <Tooltip content="Entscheider">
                        <Star className="size-3 shrink-0 fill-accent text-accent" />
                      </Tooltip>
                    ) : null}
                  </div>
                  {p.rolle ? <div className="truncate text-xs text-fg-subtle">{p.rolle}</div> : null}
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                <Tooltip content="Bearbeiten">
                  <button
                    type="button"
                    onClick={() => open(p)}
                    className="rounded p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                    aria-label={`${p.name} bearbeiten`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="rounded p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                    aria-label={`${p.name} – Aktionen`}
                  >
                    <Ellipsis className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => open(p)}>Bearbeiten</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      destructive
                      onSelect={() =>
                        start(async () => {
                          if (!confirm(`Kontakt „${p.name}" löschen?`)) return;
                          const res = await deletePerson(p.id, companyId);
                          if (res.error) alert(res.error);
                          router.refresh();
                        })
                      }
                    >
                      Kontakt löschen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
              </div>
              <div className="mt-1.5 grid gap-1 text-[13px]">
                {p.telefon ? (
                  <a
                    href={placeCallHref(p.telefon)}
                    onClick={() =>
                      void logClickToCall({ company_id: companyId, person_id: p.id, telefon: p.telefon! })
                    }
                    className="flex items-center gap-2 text-fg hover:text-accent-fg"
                  >
                    <Phone className="size-3.5 text-fg-subtle" />
                    <span className="truncate tabular-nums">{p.telefon}</span>
                  </a>
                ) : null}
                {p.email ? (
                  <div className="group flex items-center gap-2">
                    <Mail className="size-3.5 shrink-0 text-fg-subtle" />
                    <button
                      type="button"
                      onClick={() => onEmail(p.id)}
                      className="truncate text-left hover:text-accent-fg"
                      title="E-Mail schreiben"
                    >
                      {p.email}
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(p.email!)}
                      className="ml-auto shrink-0 text-fg-subtle opacity-0 hover:text-fg group-hover:opacity-100"
                      aria-label="E-Mail kopieren"
                    >
                      {copied === p.email ? (
                        <span className="text-[11px]">Kopiert</span>
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  </div>
                ) : null}
                {p.linkedin_url ? (
                  <a
                    href={normalizeUrl(p.linkedin_url) ?? "#"}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-2 text-fg-muted hover:text-fg"
                  >
                    <LinkedinIcon className="size-3.5 text-fg-subtle" />
                    <span className="truncate">LinkedIn-Profil</span>
                  </a>
                ) : null}
                {p.kontext ? (
                  <button
                    type="button"
                    onClick={() => open(p)}
                    title="Kontext bearbeiten"
                    className="mt-0.5 line-clamp-3 whitespace-pre-wrap border-l-2 border-line-strong pl-2 text-left text-xs leading-relaxed text-fg-muted hover:text-fg"
                  >
                    {p.kontext}
                  </button>
                ) : null}
                {!p.telefon || !p.email || !p.kontext ? (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {[
                      { missing: !p.telefon, label: "Telefon", focus: "ct-tel" },
                      { missing: !p.email, label: "E-Mail", focus: "ct-email" },
                      { missing: !p.kontext, label: "Kontext", focus: "ct-kontext" },
                    ]
                      .filter((x) => x.missing)
                      .map((x) => (
                        <button
                          key={x.label}
                          type="button"
                          onClick={() => open(p, x.focus)}
                          className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-line-strong px-2 text-xs text-fg-muted hover:border-fg-subtle hover:text-fg"
                        >
                          <Plus className="size-3" />
                          {x.label}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        {draft ? (
          <DialogContent title={draft.id ? "Kontakt bearbeiten" : "Neuer Kontakt"}>
            <form
              id="contact-form"
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name *" htmlFor="ct-name">
                  <Input
                    id="ct-name"
                    required
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </Field>
                <Field label="Rolle" htmlFor="ct-rolle">
                  <Input
                    id="ct-rolle"
                    value={draft.rolle}
                    placeholder="Geschäftsführer"
                    onChange={(e) => setDraft({ ...draft, rolle: e.target.value })}
                  />
                </Field>
                <Field label="E-Mail" htmlFor="ct-email">
                  <Input
                    id="ct-email"
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  />
                </Field>
                <Field label="Telefon" htmlFor="ct-tel">
                  <Input
                    id="ct-tel"
                    value={draft.telefon}
                    onChange={(e) => setDraft({ ...draft, telefon: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="LinkedIn" htmlFor="ct-li">
                <Input
                  id="ct-li"
                  value={draft.linkedin_url}
                  placeholder="linkedin.com/in/…"
                  onChange={(e) => setDraft({ ...draft, linkedin_url: e.target.value })}
                />
              </Field>
              <Field label="Kontext" htmlFor="ct-kontext">
                <Textarea
                  id="ct-kontext"
                  rows={3}
                  maxLength={4000}
                  value={draft.kontext}
                  placeholder="z. B. Inhaber, 50+, skeptisch bei Technik, lieber Telefon als Mail"
                  onChange={(e) => setDraft({ ...draft, kontext: e.target.value })}
                />
              </Field>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={draft.ist_entscheider}
                  onChange={(e) => setDraft({ ...draft, ist_entscheider: e.target.checked })}
                  className="size-4 accent-[var(--accent)]"
                />
                Entscheider (Hauptkontakt)
              </label>
              {error ? <p className="text-[13px] text-[var(--tone-red-fg)]">{error}</p> : null}
            </form>
            <DialogFooter>
              <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>
                Abbrechen
              </Button>
              <Button
                size="sm"
                type="submit"
                form="contact-form"
                disabled={pending || !draft.name.trim()}
              >
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
      {pending ? <Badge tone="gray">Speichert…</Badge> : null}
    </section>
  );
}
