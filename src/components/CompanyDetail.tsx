"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  gdprAnonymize,
  logClickToCall,
  setCustomFieldValue,
  setExcluded,
  setListPipelineStatus,
  summarizeLead,
  updateCompanyBasics,
  updateCompanyQualification,
  upsertOpportunity,
  upsertPerson,
  deletePerson,
} from "@/lib/sales/actions";
import {
  CRM_OPTIONS,
  MITARBEITER_OPTIONS,
  OPP_STAGE_OPTIONS,
  OPP_VARIANTE_OPTIONS,
  OUTREACH_KANAL_LABELS,
  OUTREACH_KANAL_OPTIONS,
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUS_OPTIONS,
  pipelineTone,
} from "@/lib/sales/types";
import type {
  Company,
  CrmSystem,
  CustomFieldDef,
  CustomFieldValue,
  EmailTemplate,
  MitarbeiterKlasse,
  Opportunity,
  OppStage,
  OppVariante,
  Person,
  PipelineStatus,
  SalesTask,
  Sequence,
  SequenceEnrollment,
  Touchpoint,
} from "@/lib/sales/types";
import { CompanyTimeline } from "@/components/CompanyTimeline";
import { placeCallHref } from "@/lib/sales/placeCall";

export function CompanyDetail({
  company,
  people,
  touchpoints,
  touchpointsTotal,
  opportunities,
  tasks,
  templates,
  sequences,
  enrollments,
  customDefs = [],
  customValues = [],
}: {
  company: Company;
  people: Person[];
  touchpoints: Touchpoint[];
  touchpointsTotal: number;
  opportunities: Opportunity[];
  tasks: SalesTask[];
  templates: EmailTemplate[];
  sequences: Sequence[];
  enrollments: SequenceEnrollment[];
  customDefs?: CustomFieldDef[];
  customValues?: CustomFieldValue[];
}) {
  const router = useRouter();
  const [callPending, startCall] = useTransition();
  const entscheider = people.find((p) => p.ist_entscheider) ?? people[0];
  const dialNumber = entscheider?.telefon || company.telefon;
  const nextTouch = touchpoints.find(
    (t) => t.naechster_touch && !t.voided_at,
  )?.naechster_touch;
  const lastTouch = touchpoints.find((t) => !t.voided_at);

  return (
    <div className="stack company-detail">
      <header>
        <h1 className="m-0 font-[family-name:var(--font-source-serif)] text-2xl font-semibold">
          {company.name}
        </h1>
        <p className="muted mb-0 mt-1">
          {[company.stadt, company.telefon, company.website]
            .filter(Boolean)
            .join(" · ") || "Keine Kontaktdaten hinterlegt"}
        </p>
        <p className="muted mt-1 mb-0">
          Desk:{" "}
          <strong>
            {company.relationship === "Kunde"
              ? "Kunden"
              : company.pipeline_status === "set_appointment"
                ? "Termine"
                : "Dialen"}
          </strong>
          {" · "}
          Status:{" "}
          <span
            className="badge-tone"
            data-tone={pipelineTone(company.pipeline_status)}
          >
            {PIPELINE_STATUS_LABELS[company.pipeline_status]}
          </span>
          {nextTouch ? ` · nächster Touch ${nextTouch}` : ""}
        </p>
        {company.recherche?.trim() ? (
          <p className="mt-2 mb-0 text-sm">
            <strong>Hook: </strong>
            {company.recherche.trim().slice(0, 220)}
            {company.recherche.trim().length > 220 ? "…" : ""}
          </p>
        ) : null}
        {lastTouch ? (
          <p className="muted mt-1 mb-0 text-xs">
            Letzter Touch: {lastTouch.kanal}
            {lastTouch.notiz
              ? ` — ${lastTouch.notiz.slice(0, 120)}${lastTouch.notiz.length > 120 ? "…" : ""}`
              : ""}
          </p>
        ) : null}
        {dialNumber ? (
          <p className="mt-2 mb-0">
            <a
              className="btn btn-primary"
              href={placeCallHref(dialNumber)}
              onClick={() =>
                startCall(async () => {
                  await logClickToCall({
                    company_id: company.id,
                    person_id: entscheider?.id ?? null,
                    telefon: dialNumber,
                  });
                  router.refresh();
                })
              }
            >
              {callPending ? "Wird gewählt…" : `Anrufen ${dialNumber}`}
            </a>
          </p>
        ) : null}
        <LeadBriefPanel company={company} />
      </header>

      <div className="company-detail-grid">
        <div className="company-detail-col stack">
          <OppStrip opportunities={opportunities} />
          <BasicsForm company={company} />
          <PipelineStatusForm company={company} />
          <QualificationForm company={company} />
          <CustomFieldsSection
            companyId={company.id}
            defs={customDefs}
            values={customValues}
          />
        </div>
        <div className="company-detail-col stack">
          <PeopleSection companyId={company.id} people={people} />
          <CompanyTimeline
            companyId={company.id}
            people={people}
            touchpoints={touchpoints}
            total={touchpointsTotal}
            tasks={tasks}
            templates={templates}
            sequences={sequences}
            enrollments={enrollments}
            defaultEmail={entscheider?.email ?? null}
            defaultPhone={dialNumber}
          />
        </div>
      </div>

      <details className="dense-panel company-detail-more">
        <summary className="section-h cursor-pointer">
          Opportunities & Admin
        </summary>
        <div className="stack" style={{ marginTop: "0.85rem" }}>
          <OppSection companyId={company.id} opportunities={opportunities} />
          <AdminDanger companyId={company.id} />
        </div>
      </details>
    </div>
  );
}

function LeadBriefPanel({ company }: { company: Company }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="stack" style={{ marginTop: "0.85rem" }}>
      <div className="form-actions wrap">
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await summarizeLead(company.id);
              if (res.error) {
                setError(res.error);
                setSummary(null);
                return;
              }
              if (res.ok) setSummary(res.summary);
            })
          }
        >
          {pending ? "KI läuft…" : "Was wissen wir? (KI)"}
        </button>
        {summary ? (
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const next = [company.recherche?.trim(), summary]
                  .filter(Boolean)
                  .join("\n\n");
                const res = await updateCompanyBasics(company.id, {
                  name: company.name,
                  stadt: company.stadt,
                  telefon: company.telefon,
                  website: company.website,
                  instagram_url: company.instagram_url,
                  facebook_url: company.facebook_url,
                  linkedin_url: company.linkedin_url,
                  recherche: next,
                  inserate_aktiv: company.inserate_aktiv,
                  meta_ads: company.meta_ads,
                });
                if (res.error) setError(res.error);
                else router.refresh();
              })
            }
          >
            In Recherche speichern
          </button>
        ) : null}
      </div>
      {error ? <p className="muted mb-0">{error}</p> : null}
      {summary ? (
        <pre
          className="dense-panel"
          style={{
            whiteSpace: "pre-wrap",
            fontFamily: "inherit",
            fontSize: "0.85rem",
            margin: 0,
          }}
        >
          {summary}
        </pre>
      ) : null}
    </div>
  );
}

function BasicsForm({ company }: { company: Company }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState(company.name);
  const [stadt, setStadt] = useState(company.stadt ?? "");
  const [telefon, setTelefon] = useState(company.telefon ?? "");
  const [website, setWebsite] = useState(company.website ?? "");
  const [instagram, setInstagram] = useState(company.instagram_url ?? "");
  const [facebook, setFacebook] = useState(company.facebook_url ?? "");
  const [linkedin, setLinkedin] = useState(company.linkedin_url ?? "");
  const [recherche, setRecherche] = useState(company.recherche ?? "");

  useEffect(() => {
    setName(company.name);
    setStadt(company.stadt ?? "");
    setTelefon(company.telefon ?? "");
    setWebsite(company.website ?? "");
    setInstagram(company.instagram_url ?? "");
    setFacebook(company.facebook_url ?? "");
    setLinkedin(company.linkedin_url ?? "");
    setRecherche(company.recherche ?? "");
  }, [company]);

  return (
    <section className="dense-panel">
      <h2 className="section-h">Stammdaten</h2>
      <p className="muted">Firma, Ort, Telefon und Web/Social.</p>
      <form
        className="stack"
        style={{ marginTop: "0.85rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await updateCompanyBasics(company.id, {
              name,
              stadt: stadt || null,
              telefon: telefon || null,
              website: website || null,
              instagram_url: instagram || null,
              facebook_url: facebook || null,
              linkedin_url: linkedin || null,
              recherche: recherche || null,
            });
            if (res.error) {
              setMsg(res.error);
              return;
            }
            setMsg("Gespeichert");
            router.refresh();
          });
        }}
      >
        <div className="grid-2">
          <div className="field">
            <label>Firma</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Stadt</label>
            <input value={stadt} onChange={(e) => setStadt(e.target.value)} />
          </div>
          <div className="field">
            <label>Bundesland</label>
            <input
              value={company.bundesland ?? "—"}
              disabled
              title="Abgeleitet — nicht clientseitig schreibbar"
            />
          </div>
          <div className="field">
            <label>Telefon</label>
            <input
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Website</label>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="field">
            <label>LinkedIn</label>
            <input
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Instagram</label>
            <input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Facebook</label>
            <input
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Recherche</label>
          <textarea
            rows={4}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Gewerk, Kontext, Gesprächsaufhänger…"
          />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            Speichern
          </button>
          {msg ? <span className="muted">{msg}</span> : null}
        </div>
      </form>
    </section>
  );
}

function PipelineStatusForm({ company }: { company: Company }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<PipelineStatus>(
    company.pipeline_status,
  );
  const [kanal, setKanal] = useState<"call" | "dm">("call");
  const [next, setNext] = useState("");

  useEffect(() => {
    setStatus(company.pipeline_status);
  }, [company.pipeline_status]);

  return (
    <section className="dense-panel">
      <h2 className="section-h">Pipeline-Status</h2>
      <p className="muted">
        Ändert den Firmen-Status und loggt einen Touch. Kanal DM zählt in
        Analytics unter LinkedIn DMs.
      </p>
      <form
        className="stack"
        style={{ marginTop: "0.85rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await setListPipelineStatus({
              companyId: company.id,
              pipelineStatus: status,
              kanal,
              naechsterTouch: next || null,
            });
            if (res.error) {
              setMsg(res.error);
              return;
            }
            setMsg(`Status gesetzt · nächster Touch ${res.naechster_touch}`);
            router.refresh();
          });
        }}
      >
        <div className="grid-3">
          <div className="field">
            <label>Status</label>
            <select
              className="pipeline-select"
              data-tone={pipelineTone(status)}
              value={status}
              onChange={(e) => setStatus(e.target.value as PipelineStatus)}
            >
              {PIPELINE_STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {PIPELINE_STATUS_LABELS[o]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Kanal</label>
            <select
              value={kanal}
              onChange={(e) => setKanal(e.target.value as "call" | "dm")}
            >
              {OUTREACH_KANAL_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {OUTREACH_KANAL_LABELS[o]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Nächster Touch</label>
            <input
              type="date"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            Status speichern
          </button>
          {msg ? <span className="muted">{msg}</span> : null}
        </div>
      </form>
    </section>
  );
}

function QualificationForm({ company }: { company: Company }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [mitarbeiterzahl, setMitarbeiterzahl] = useState<
    MitarbeiterKlasse | ""
  >(company.mitarbeiterzahl ?? "");
  const [crm, setCrm] = useState<CrmSystem | "">(company.crm_system ?? "");
  const [anfragen, setAnfragen] = useState(
    company.anfragen_pro_woche?.toString() ?? "",
  );
  const [inserate, setInserate] = useState(
    company.inserate_aktiv?.toString() ?? "",
  );
  const [metaAds, setMetaAds] = useState<"" | "ja" | "nein">(
    company.meta_ads === true ? "ja" : company.meta_ads === false ? "nein" : "",
  );

  useEffect(() => {
    setMitarbeiterzahl(company.mitarbeiterzahl ?? "");
    setCrm(company.crm_system ?? "");
    setAnfragen(company.anfragen_pro_woche?.toString() ?? "");
    setInserate(company.inserate_aktiv?.toString() ?? "");
    setMetaAds(
      company.meta_ads === true
        ? "ja"
        : company.meta_ads === false
          ? "nein"
          : "",
    );
  }, [company]);

  return (
    <section className="dense-panel">
      <h2 className="section-h">Qualifikation</h2>
      <p className="muted">
        Mitarbeiter, CRM, Inserate und Meta Ads. Relationship ist{" "}
        <strong>{company.relationship}</strong> — abgeleitet aus dem
        Pipeline-Status und nur dort änderbar.
      </p>
      <form
        className="stack"
        style={{ marginTop: "0.85rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const qual = await updateCompanyQualification(company.id, {
              mitarbeiterzahl: (mitarbeiterzahl ||
                null) as MitarbeiterKlasse | null,
              crm_system: (crm || null) as CrmSystem | null,
              anfragen_pro_woche: anfragen === "" ? null : Number(anfragen),
            });
            if (qual.error) {
              setMsg(qual.error);
              return;
            }
            const basics = await updateCompanyBasics(company.id, {
              name: company.name,
              stadt: company.stadt,
              telefon: company.telefon,
              website: company.website,
              instagram_url: company.instagram_url,
              facebook_url: company.facebook_url,
              linkedin_url: company.linkedin_url,
              recherche: company.recherche,
              inserate_aktiv: inserate === "" ? null : Number(inserate),
              meta_ads:
                metaAds === "ja" ? true : metaAds === "nein" ? false : null,
            });
            if (basics.error) {
              setMsg(basics.error);
              return;
            }
            setMsg("Gespeichert");
            router.refresh();
          });
        }}
      >
        <div className="grid-2">
          <div className="field">
            <label>Mitarbeiterzahl</label>
            <select
              value={mitarbeiterzahl}
              onChange={(e) =>
                setMitarbeiterzahl(e.target.value as MitarbeiterKlasse | "")
              }
            >
              <option value="">—</option>
              {MITARBEITER_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>CRM-System</label>
            <select
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
          </div>
          <div className="field">
            <label>Anfragen / Woche</label>
            <input
              type="number"
              min={0}
              value={anfragen}
              onChange={(e) => setAnfragen(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Inserate aktiv</label>
            <input
              type="number"
              min={0}
              value={inserate}
              onChange={(e) => setInserate(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Meta Ads</label>
            <select
              value={metaAds}
              onChange={(e) =>
                setMetaAds(e.target.value as "" | "ja" | "nein")
              }
            >
              <option value="">—</option>
              <option value="ja">Ja</option>
              <option value="nein">Nein</option>
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            Speichern
          </button>
          {msg ? <span className="muted">{msg}</span> : null}
        </div>
      </form>
    </section>
  );
}

function CustomFieldsSection({
  companyId,
  defs,
  values,
}: {
  companyId: string;
  defs: CustomFieldDef[];
  values: CustomFieldValue[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const byField = new Map(values.map((v) => [v.field_id, v]));

  if (!defs.length) return null;

  return (
    <section className="dense-panel">
      <h2 className="section-h">Freie Felder</h2>
      <p className="muted">Werte aus den Einstellungen-Felddefinitionen.</p>
      <div className="stack" style={{ marginTop: "0.85rem" }}>
        {defs.map((def) => {
          const current = byField.get(def.id);
          return (
            <CustomFieldEditor
              key={def.id}
              def={def}
              value={current}
              disabled={pending}
              onSave={(patch) =>
                start(async () => {
                  const res = await setCustomFieldValue({
                    company_id: companyId,
                    field_id: def.id,
                    ...patch,
                  });
                  if (res.error) setMsg(res.error);
                  else {
                    setMsg("Gespeichert");
                    router.refresh();
                  }
                })
              }
            />
          );
        })}
        {msg ? <span className="muted">{msg}</span> : null}
      </div>
    </section>
  );
}

function CustomFieldEditor({
  def,
  value,
  disabled,
  onSave,
}: {
  def: CustomFieldDef;
  value?: CustomFieldValue;
  disabled: boolean;
  onSave: (patch: {
    value_text?: string | null;
    value_number?: number | null;
    value_json?: string[] | null;
  }) => void;
}) {
  const [text, setText] = useState(value?.value_text ?? "");
  const [number, setNumber] = useState(
    value?.value_number != null ? String(value.value_number) : "",
  );
  const [multi, setMulti] = useState<string[]>(value?.value_json ?? []);

  useEffect(() => {
    setText(value?.value_text ?? "");
    setNumber(value?.value_number != null ? String(value.value_number) : "");
    setMulti(value?.value_json ?? []);
  }, [value]);

  return (
    <div className="field">
      <label>{def.name}</label>
      {def.field_type === "number" ? (
        <input
          type="number"
          disabled={disabled}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          onBlur={() =>
            onSave({
              value_number: number === "" ? null : Number(number),
              value_text: null,
              value_json: null,
            })
          }
        />
      ) : def.field_type === "single_select" ? (
        <select
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onSave({
              value_text: e.target.value || null,
              value_number: null,
              value_json: null,
            });
          }}
        >
          <option value="">—</option>
          {def.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : def.field_type === "multi_select" ? (
        <div className="form-actions wrap">
          {def.options.map((o) => {
            const on = multi.includes(o);
            return (
              <button
                key={o}
                type="button"
                className={`btn${on ? " btn-primary" : ""}`}
                disabled={disabled}
                onClick={() => {
                  const next = on
                    ? multi.filter((x) => x !== o)
                    : [...multi, o];
                  setMulti(next);
                  onSave({
                    value_json: next,
                    value_text: null,
                    value_number: null,
                  });
                }}
              >
                {o}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          type={def.field_type === "url" ? "url" : "text"}
          disabled={disabled}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() =>
            onSave({
              value_text: text || null,
              value_number: null,
              value_json: null,
            })
          }
        />
      )}
    </div>
  );
}

/**
 * Person anzeigen, bearbeiten oder löschen.
 *
 * Vorher liessen sich Personen nur anlegen und löschen. Eine falsche
 * Telefonnummer zu korrigieren bedeutete Löschen + Neuanlegen — und weil
 * `touchpoints.person_id` bei DELETE auf NULL gesetzt wird, ging dabei die
 * Zuordnung der gesamten Gesprächshistorie verloren.
 */
function PersonRow({
  person,
  companyId,
}: {
  person: Person;
  companyId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: person.name,
    rolle: person.rolle ?? "",
    email: person.email ?? "",
    telefon: person.telefon ?? "",
    linkedin_url: person.linkedin_url ?? "",
    ist_entscheider: person.ist_entscheider,
  });

  useEffect(() => {
    setForm({
      name: person.name,
      rolle: person.rolle ?? "",
      email: person.email ?? "",
      telefon: person.telefon ?? "",
      linkedin_url: person.linkedin_url ?? "",
      ist_entscheider: person.ist_entscheider,
    });
  }, [person]);

  return (
    <div className="person-entry">
      <div className="person-row">
        <div>
          <strong>{person.name}</strong>
          {person.ist_entscheider ? (
            <span className="badge" data-tone="gruen">
              Entscheider
            </span>
          ) : null}
          <div className="muted">
            {[person.rolle, person.telefon, person.email]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
        </div>
        <div className="form-actions wrap">
          <button
            type="button"
            className="btn"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? "Schließen" : "Bearbeiten"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (
                  !confirm(
                    `${person.name} löschen? Bereits protokollierte Touchpoints verlieren dadurch die Personen-Zuordnung.`,
                  )
                ) {
                  return;
                }
                const res = await deletePerson(person.id, companyId);
                if (res.error) {
                  setError(res.error);
                  return;
                }
                setError(null);
                router.refresh();
              })
            }
          >
            Löschen
          </button>
        </div>
      </div>

      {open ? (
        <form
          className="stack"
          style={{ marginTop: "0.6rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await upsertPerson({
                id: person.id,
                company_id: companyId,
                name: form.name,
                rolle: form.rolle || null,
                email: form.email || null,
                telefon: form.telefon || null,
                linkedin_url: form.linkedin_url || null,
                ist_entscheider: form.ist_entscheider,
              });
              if (res.error) {
                setError(res.error);
                return;
              }
              setError(null);
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <div className="grid-2">
            <div className="field">
              <label>Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Rolle</label>
              <input
                value={form.rolle}
                onChange={(e) => setForm({ ...form, rolle: e.target.value })}
              />
            </div>
            <div className="field">
              <label>E-Mail</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Telefon</label>
              <input
                value={form.telefon}
                onChange={(e) => setForm({ ...form, telefon: e.target.value })}
              />
            </div>
            <div className="field">
              <label>LinkedIn</label>
              <input
                value={form.linkedin_url}
                onChange={(e) =>
                  setForm({ ...form, linkedin_url: e.target.value })
                }
              />
            </div>
            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={form.ist_entscheider}
                onChange={(e) =>
                  setForm({ ...form, ist_entscheider: e.target.checked })
                }
              />
              Entscheider
            </label>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={pending}>
            Person speichern
          </button>
        </form>
      ) : null}

      {!open && error ? <p className="error">{error}</p> : null}
    </div>
  );
}

function PeopleSection({
  companyId,
  people,
}: {
  companyId: string;
  people: Person[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const blank = {
    name: "",
    rolle: "",
    email: "",
    telefon: "",
    linkedin_url: "",
    ist_entscheider: people.length === 0,
  };
  const [form, setForm] = useState(blank);

  return (
    <section className="dense-panel">
      <h2 className="section-h">Personen</h2>
      <p className="muted">Max. ein Entscheider pro Firma (DB + UI).</p>
      <div className="stack" style={{ marginTop: "0.85rem" }}>
        {people.map((p) => (
          <PersonRow key={p.id} person={p} companyId={companyId} />
        ))}

        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await upsertPerson({
                company_id: companyId,
                name: form.name,
                rolle: form.rolle || null,
                email: form.email || null,
                telefon: form.telefon || null,
                linkedin_url: form.linkedin_url || null,
                ist_entscheider: form.ist_entscheider,
              });
              if (res.error) {
                setError(res.error);
                return;
              }
              setError(null);
              setForm({ ...blank, ist_entscheider: false });
              router.refresh();
            });
          }}
        >
          <div className="grid-2">
            <div className="field">
              <label>Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Rolle</label>
              <input
                value={form.rolle}
                onChange={(e) => setForm({ ...form, rolle: e.target.value })}
              />
            </div>
            <div className="field">
              <label>E-Mail</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Telefon</label>
              <input
                value={form.telefon}
                onChange={(e) => setForm({ ...form, telefon: e.target.value })}
              />
            </div>
            <div className="field">
              <label>LinkedIn</label>
              <input
                value={form.linkedin_url}
                onChange={(e) =>
                  setForm({ ...form, linkedin_url: e.target.value })
                }
              />
            </div>
            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={form.ist_entscheider}
                onChange={(e) =>
                  setForm({ ...form, ist_entscheider: e.target.checked })
                }
              />
              Entscheider
            </label>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={pending}>
            Person hinzufügen
          </button>
        </form>
      </div>
    </section>
  );
}

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/**
 * Bestehende Opportunity bearbeiten.
 *
 * Ohne dieses Formular liess sich eine Opportunity nur anlegen, nie ändern —
 * damit war kein Deal auf `gewonnen`/`verloren` zu setzen und Umsatz sowie
 * Close-Rate im Analytics-Dashboard blieben dauerhaft bei null.
 */
function OppRow({ opp }: { opp: Opportunity }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [variante, setVariante] = useState<OppVariante>(opp.variante);
  const [stage, setStage] = useState<OppStage>(opp.stage);
  const [setup, setSetup] = useState(opp.setup_preis?.toString() ?? "");
  const [retainer, setRetainer] = useState(
    opp.retainer_monatlich?.toString() ?? "",
  );
  const [grund, setGrund] = useState(opp.close_grund ?? "");
  const [titel, setTitel] = useState(opp.titel ?? "");
  const [erwarteter, setErwarteter] = useState(
    opp.erwarteter_umsatz?.toString() ?? "",
  );

  useEffect(() => {
    setVariante(opp.variante);
    setStage(opp.stage);
    setSetup(opp.setup_preis?.toString() ?? "");
    setRetainer(opp.retainer_monatlich?.toString() ?? "");
    setGrund(opp.close_grund ?? "");
    setTitel(opp.titel ?? "");
    setErwarteter(opp.erwarteter_umsatz?.toString() ?? "");
  }, [opp]);

  const summary = [
    opp.titel,
    opp.variante,
    opp.stage,
    opp.erwarteter_umsatz != null
      ? EUR.format(opp.erwarteter_umsatz)
      : null,
    opp.setup_preis != null ? EUR.format(opp.setup_preis) : null,
    opp.retainer_monatlich != null
      ? `${EUR.format(opp.retainer_monatlich)}/M`
      : null,
    opp.closed_at
      ? `closed ${new Date(opp.closed_at).toLocaleDateString("de-DE")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="opp-row">
      <div className="form-actions wrap">
        <span>{summary}</span>
        <button
          type="button"
          className="btn"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "Schließen" : "Bearbeiten"}
        </button>
      </div>

      {open ? (
        <form
          className="stack"
          style={{ marginTop: "0.6rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await upsertOpportunity({
                id: opp.id,
                company_id: opp.company_id,
                variante,
                stage,
                setup_preis: setup === "" ? null : Number(setup),
                retainer_monatlich: retainer === "" ? null : Number(retainer),
                close_grund: grund || null,
                titel: titel || null,
                erwarteter_umsatz:
                  erwarteter === "" ? null : Number(erwarteter),
              });
              if (res.error) {
                setError(res.error);
                return;
              }
              setError(null);
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <div className="grid-2">
            <div className="field">
              <label>Titel</label>
              <input
                value={titel}
                onChange={(e) => setTitel(e.target.value)}
                placeholder="Deal-Name"
              />
            </div>
            <div className="field">
              <label>Erwarteter Umsatz</label>
              <input
                type="number"
                min={0}
                value={erwarteter}
                onChange={(e) => setErwarteter(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Variante</label>
              <select
                value={variante}
                onChange={(e) => setVariante(e.target.value as OppVariante)}
              >
                {OPP_VARIANTE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Stage</label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as OppStage)}
              >
                {OPP_STAGE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Setup-Preis</label>
              <input
                type="number"
                min={0}
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Retainer / Monat</label>
              <input
                type="number"
                min={0}
                value={retainer}
                onChange={(e) => setRetainer(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Close-Grund</label>
              <input
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
              />
            </div>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={pending}>
            Opportunity speichern
          </button>
        </form>
      ) : null}
    </div>
  );
}

function OppStrip({ opportunities }: { opportunities: Opportunity[] }) {
  const open = opportunities.filter(
    (o) => o.stage !== "gewonnen" && o.stage !== "verloren",
  );
  return (
    <section className="dense-panel">
      <h2 className="section-h">Opportunities</h2>
      {open.length === 0 ? (
        <p className="muted mb-0">
          Keine offenen Deals.{" "}
          <span className="muted">Anlage unter „Opportunities & Admin“.</span>
        </p>
      ) : (
        <ul className="task-list">
          {open.map((o) => (
            <li key={o.id} className="task-item">
              <div>
                <strong>{o.titel || o.variante}</strong>
                <div className="muted">
                  {o.stage}
                  {o.erwarteter_umsatz != null
                    ? ` · ${EUR.format(o.erwarteter_umsatz)}`
                    : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {opportunities.length > 0 && open.length === 0 ? (
        <p className="muted text-xs mb-0">{opportunities.length} geschlossen</p>
      ) : null}
    </section>
  );
}

function OppSection({
  companyId,
  opportunities,
}: {
  companyId: string;
  opportunities: Opportunity[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [variante, setVariante] = useState<OppVariante>("system_3k");
  const [stage, setStage] = useState<OppStage>("offen");
  const [setup, setSetup] = useState("");
  const [retainer, setRetainer] = useState("");
  const [grund, setGrund] = useState("");
  const [titel, setTitel] = useState("");
  const [erwarteter, setErwarteter] = useState("");

  return (
    <section>
      <h3 className="section-h">Opportunities</h3>
      {opportunities.length === 0 ? (
        <p className="muted">Noch keine Opportunities.</p>
      ) : (
        <div className="stack">
          {opportunities.map((o) => (
            <OppRow key={o.id} opp={o} />
          ))}
        </div>
      )}
      <form
        className="stack"
        style={{ marginTop: "0.85rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await upsertOpportunity({
              company_id: companyId,
              variante,
              stage,
              setup_preis: setup === "" ? null : Number(setup),
              retainer_monatlich: retainer === "" ? null : Number(retainer),
              close_grund: grund || null,
              titel: titel || null,
              erwarteter_umsatz:
                erwarteter === "" ? null : Number(erwarteter),
            });
            if (res.error) {
              setError(res.error);
              return;
            }
            setError(null);
            setSetup("");
            setRetainer("");
            setGrund("");
            setTitel("");
            setErwarteter("");
            setStage("offen");
            router.refresh();
          });
        }}
      >
        <div className="grid-2">
          <div className="field">
            <label>Titel</label>
            <input
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="Deal-Name"
            />
          </div>
          <div className="field">
            <label>Erwarteter Umsatz</label>
            <input
              type="number"
              min={0}
              value={erwarteter}
              onChange={(e) => setErwarteter(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Variante</label>
            <select
              value={variante}
              onChange={(e) => setVariante(e.target.value as OppVariante)}
            >
              {OPP_VARIANTE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Stage</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as OppStage)}
            >
              {OPP_STAGE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Setup-Preis</label>
            <input
              type="number"
              value={setup}
              onChange={(e) => setSetup(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Retainer / Monat</label>
            <input
              type="number"
              value={retainer}
              onChange={(e) => setRetainer(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Close-Grund</label>
            <input value={grund} onChange={(e) => setGrund(e.target.value)} />
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Opportunity anlegen
        </button>
      </form>
    </section>
  );
}

function AdminDanger({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <section>
      <h3 className="section-h">Admin</h3>
      <p className="muted">
        Ausschließen entfernt die Firma aus der Prospect-Liste.
        DSGVO-Anonymisierung ist nur bei Art.-17-Anfragen — nicht für den
        Call-Alltag.
      </p>
      <div className="form-actions wrap">
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              if (
                !confirm("Firma ausschließen (relationship = Ausgeschlossen)?")
              )
                return;
              const res = await setExcluded(companyId);
              if (res.error) {
                setMsg(res.error);
                return;
              }
              setMsg("Ausgeschlossen");
              router.refresh();
            })
          }
        >
          Ausschließen
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const ok = confirm(
                "Art.17: PII anonymisieren und auf Ausgeschlossen setzen? Touch-Zähler bleiben. Nur bei Löschbegehren.",
              );
              if (!ok) return;
              const again = prompt('Zur Bestätigung "ANONYMISIEREN" eingeben');
              if (again !== "ANONYMISIEREN") {
                setMsg("Abgebrochen");
                return;
              }
              const res = await gdprAnonymize(companyId);
              if (res.error) {
                setMsg(res.error);
                return;
              }
              setMsg("Anonymisiert");
              router.refresh();
            })
          }
        >
          DSGVO anonymisieren
        </button>
      </div>
      {msg ? <p className="muted">{msg}</p> : null}
    </section>
  );
}
