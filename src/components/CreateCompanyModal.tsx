"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createCompany,
  findSimilarCompanies,
  type SimilarCompany,
} from "@/lib/sales/actions";
import type { CrmSystem, PipelineStatus } from "@/lib/sales/types";
import {
  CRM_OPTIONS,
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUS_OPTIONS,
  pipelineTone,
} from "@/lib/sales/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateCompanyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (companyId: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [stadt, setStadt] = useState("");
  const [telefon, setTelefon] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [crm, setCrm] = useState<CrmSystem | "">("");
  const [anfragen, setAnfragen] = useState("");
  const [pipeline, setPipeline] = useState<PipelineStatus>("neu");
  const [personName, setPersonName] = useState("");
  const [personEmail, setPersonEmail] = useState("");
  const [personTel, setPersonTel] = useState("");
  const [personLinkedin, setPersonLinkedin] = useState("");
  const [similar, setSimilar] = useState<SimilarCompany[]>([]);

  // Entprellte Dublettenprüfung während der Eingabe.
  useEffect(() => {
    if (!open || name.trim().length < 3) {
      setSimilar([]);
      return;
    }
    const timer = setTimeout(() => {
      findSimilarCompanies(name).then(setSimilar).catch(() => setSimilar([]));
    }, 400);
    return () => clearTimeout(timer);
  }, [name, open]);

  if (!open) return null;

  function reset() {
    setName("");
    setStadt("");
    setTelefon("");
    setWebsite("");
    setInstagram("");
    setFacebook("");
    setCrm("");
    setAnfragen("");
    setPipeline("neu");
    setPersonName("");
    setPersonEmail("");
    setPersonTel("");
    setPersonLinkedin("");
    setSimilar([]);
    setError(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-company-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-rais-border bg-rais-linen p-4 shadow-lg">
        <h2
          id="create-company-title"
          className="font-[family-name:var(--font-source-serif)] text-lg font-semibold"
        >
          Neue Firma
        </h2>
        <p className="mt-1 text-sm text-rais-stone">
          Stammdaten + optional Entscheider. Erscheint in der Prospect-Liste.
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await createCompany({
                name,
                stadt: stadt || null,
                telefon: telefon || null,
                website: website || null,
                instagram_url: instagram || null,
                facebook_url: facebook || null,
                crm_system: (crm || null) as CrmSystem | null,
                anfragen_pro_woche:
                  anfragen === "" ? null : Number(anfragen),
                pipeline_status: pipeline,
                person: personName.trim()
                  ? {
                      name: personName,
                      email: personEmail || null,
                      telefon: personTel || null,
                      linkedin_url: personLinkedin || null,
                    }
                  : null,
              });
              if (res.error || !("companyId" in res) || !res.companyId) {
                setError(res.error ?? "Anlegen fehlgeschlagen");
                return;
              }
              reset();
              onCreated?.(res.companyId);
              onClose();
              router.refresh();
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field sm:col-span-2">
              <span>Firma *</span>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Firmenname"
              />
              {similar.length > 0 ? (
                <div className="mt-1 rounded-md border border-rais-orange bg-[#fff7f2] p-2 text-xs">
                  <div className="font-semibold text-rais-charcoal">
                    Möglicherweise schon vorhanden:
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {similar.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/firma/${c.id}`}
                          className="text-rais-orange hover:underline"
                        >
                          {c.name}
                        </Link>
                        <span className="text-rais-stone">
                          {c.stadt ? ` · ${c.stadt}` : ""} · {c.relationship}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 text-rais-stone">
                    Firmen lassen sich nicht löschen — lieber die bestehende
                    öffnen als ein Duplikat anlegen.
                  </div>
                </div>
              ) : null}
            </label>
            <label className="field">
              <span>Stadt</span>
              <Input value={stadt} onChange={(e) => setStadt(e.target.value)} />
            </label>
            <label className="field">
              <span>Telefon</span>
              <Input
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Website</span>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="field">
              <span>Instagram</span>
              <Input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Facebook</span>
              <Input
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
              />
            </label>
            <label className="field">
              <span>CRM</span>
              <select
                className="h-9 w-full rounded-md border border-rais-border bg-white px-2 text-sm"
                value={crm}
                onChange={(e) => setCrm(e.target.value as CrmSystem | "")}
              >
                <option value="">—</option>
                {CRM_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Anfragen / Woche</span>
              <Input
                type="number"
                min={0}
                value={anfragen}
                onChange={(e) => setAnfragen(e.target.value)}
              />
            </label>
            <label className="field sm:col-span-2">
              <span>Pipeline-Status</span>
              <select
                className="pipeline-select h-9 w-full rounded-md border border-rais-border px-2 text-sm font-semibold"
                data-tone={pipelineTone(pipeline)}
                value={pipeline}
                onChange={(e) =>
                  setPipeline(e.target.value as PipelineStatus)
                }
              >
                {PIPELINE_STATUS_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {PIPELINE_STATUS_LABELS[o]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="border-t border-rais-border pt-3">
            <div className="mb-2 text-sm font-semibold">
              Entscheider (optional)
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field sm:col-span-2">
                <span>Name</span>
                <Input
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                />
              </label>
              <label className="field">
                <span>E-Mail</span>
                <Input
                  type="email"
                  value={personEmail}
                  onChange={(e) => setPersonEmail(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Telefon</span>
                <Input
                  value={personTel}
                  onChange={(e) => setPersonTel(e.target.value)}
                />
              </label>
              <label className="field sm:col-span-2">
                <span>LinkedIn</span>
                <Input
                  value={personLinkedin}
                  onChange={(e) => setPersonLinkedin(e.target.value)}
                />
              </label>
            </div>
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Speichern…" : "Anlegen"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
