"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  gdprAnonymize,
  insertTouchpoint,
  setExcluded,
  setListPipelineStatus,
  updateCompanyBasics,
  updateCompanyQualification,
  upsertOpportunity,
  upsertPerson,
  deletePerson,
} from "@/lib/sales/actions";
import {
  ABBRUCH_OPTIONS,
  abbruchAllowed,
  CRM_OPTIONS,
  ERGEBNIS_LABELS,
  ERGEBNIS_OPTIONS,
  KANAL_LABELS,
  KANAL_OPTIONS,
  MITARBEITER_OPTIONS,
  OPP_STAGE_OPTIONS,
  OPP_VARIANTE_OPTIONS,
  OUTREACH_KANAL_LABELS,
  OUTREACH_KANAL_OPTIONS,
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUS_OPTIONS,
  RELATIONSHIP_OPTIONS,
  ergebnisTone,
  pipelineTone,
} from "@/lib/sales/types";
import type {
  Abbruchgrund,
  Company,
  CrmSystem,
  MitarbeiterKlasse,
  Opportunity,
  OppStage,
  OppVariante,
  Person,
  PipelineStatus,
  Relationship,
  TouchErgebnis,
  TouchKanal,
  Touchpoint,
} from "@/lib/sales/types";

export function CompanyDetail({
  company,
  people,
  touchpoints,
  opportunities,
}: {
  company: Company;
  people: Person[];
  touchpoints: Touchpoint[];
  opportunities: Opportunity[];
}) {
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
          Pipeline:{" "}
          <span
            className="badge-tone"
            data-tone={pipelineTone(company.pipeline_status)}
          >
            {PIPELINE_STATUS_LABELS[company.pipeline_status]}
          </span>
        </p>
      </header>

      <div className="company-detail-grid">
        <div className="company-detail-col stack">
          <BasicsForm company={company} />
          <PipelineStatusForm company={company} />
          <QualificationForm company={company} />
        </div>
        <div className="company-detail-col stack">
          <PeopleSection companyId={company.id} people={people} />
          <TouchSection
            companyId={company.id}
            people={people}
            touchpoints={touchpoints}
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

  useEffect(() => {
    setName(company.name);
    setStadt(company.stadt ?? "");
    setTelefon(company.telefon ?? "");
    setWebsite(company.website ?? "");
    setInstagram(company.instagram_url ?? "");
    setFacebook(company.facebook_url ?? "");
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
  const [relationship, setRelationship] = useState<Relationship>(
    company.relationship,
  );

  useEffect(() => {
    setMitarbeiterzahl(company.mitarbeiterzahl ?? "");
    setCrm(company.crm_system ?? "");
    setAnfragen(company.anfragen_pro_woche?.toString() ?? "");
    setRelationship(company.relationship);
  }, [company]);

  return (
    <section className="dense-panel">
      <h2 className="section-h">Qualifikation</h2>
      <p className="muted">
        Mitarbeiter, CRM, Anfragen und Relationship (Prospect / Kunde /
        Ausgeschlossen).
      </p>
      <form
        className="stack"
        style={{ marginTop: "0.85rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await updateCompanyQualification(company.id, {
              mitarbeiterzahl: (mitarbeiterzahl ||
                null) as MitarbeiterKlasse | null,
              crm_system: (crm || null) as CrmSystem | null,
              anfragen_pro_woche: anfragen === "" ? null : Number(anfragen),
              relationship,
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
            <label>Relationship</label>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as Relationship)}
            >
              {RELATIONSHIP_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
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
          <div key={p.id} className="person-row">
            <div>
              <strong>{p.name}</strong>
              {p.ist_entscheider ? (
                <span className="badge" data-tone="gruen">
                  Entscheider
                </span>
              ) : null}
              <div className="muted">
                {[p.rolle, p.telefon, p.email].filter(Boolean).join(" · ") ||
                  "—"}
              </div>
            </div>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deletePerson(p.id, companyId);
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

function TouchSection({
  companyId,
  people,
  touchpoints,
}: {
  companyId: string;
  people: Person[];
  touchpoints: Touchpoint[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const entscheider = people.find((p) => p.ist_entscheider) ?? people[0];
  const [kanal, setKanal] = useState<TouchKanal>("call");
  const [ergebnis, setErgebnis] = useState<TouchErgebnis>("nicht_erreicht");
  const [abbruch, setAbbruch] = useState<Abbruchgrund | "">("");
  const [notiz, setNotiz] = useState("");
  const [next, setNext] = useState("");
  const [personId, setPersonId] = useState(entscheider?.id ?? "");

  useEffect(() => {
    if (entscheider?.id) setPersonId(entscheider.id);
  }, [entscheider?.id]);

  return (
    <section className="dense-panel">
      <h2 className="section-h">Touchpoints</h2>
      <p className="muted">
        Append-only — kein Bearbeiten oder Löschen. Kanal DM erhöht den
        LinkedIn-DM-KPI in Analytics.
      </p>

      <form
        className="stack"
        style={{ marginTop: "0.85rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await insertTouchpoint({
              company_id: companyId,
              person_id: personId || null,
              kanal,
              ergebnis,
              notiz: notiz || null,
              naechster_touch: next || null,
              abbruchgrund: abbruchAllowed(ergebnis)
                ? (abbruch as Abbruchgrund) || null
                : null,
            });
            if (res.error) {
              setError(res.error);
              return;
            }
            setError(null);
            setNotiz("");
            setAbbruch("");
            router.refresh();
          });
        }}
      >
        <div className="grid-3">
          <div className="field">
            <label>Person</label>
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
            >
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.ist_entscheider ? " (E)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Kanal</label>
            <select
              value={kanal}
              onChange={(e) => setKanal(e.target.value as TouchKanal)}
            >
              {KANAL_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {KANAL_LABELS[o]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Ergebnis</label>
            <select
              value={ergebnis}
              onChange={(e) => setErgebnis(e.target.value as TouchErgebnis)}
            >
              {ERGEBNIS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {ERGEBNIS_LABELS[o]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Abbruchgrund</label>
            <select
              value={abbruch}
              disabled={!abbruchAllowed(ergebnis)}
              onChange={(e) => setAbbruch(e.target.value as Abbruchgrund | "")}
            >
              <option value="">—</option>
              {ABBRUCH_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
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
          <div className="field">
            <label>Notiz</label>
            <input value={notiz} onChange={(e) => setNotiz(e.target.value)} />
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Touch speichern
        </button>
      </form>

      <div className="table-wrap" style={{ marginTop: "1rem" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Wann</th>
              <th>Kanal</th>
              <th>Ergebnis</th>
              <th>Notiz</th>
              <th>Nächster</th>
            </tr>
          </thead>
          <tbody>
            {touchpoints.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Noch keine Touchpoints
                </td>
              </tr>
            ) : (
              touchpoints.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.occurred_at).toLocaleString("de-DE")}</td>
                  <td>{KANAL_LABELS[t.kanal]}</td>
                  <td>
                    <span
                      className="badge"
                      data-tone={ergebnisTone(t.ergebnis)}
                    >
                      {ERGEBNIS_LABELS[t.ergebnis]}
                    </span>
                  </td>
                  <td>{t.notiz ?? "—"}</td>
                  <td>{t.naechster_touch ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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

  return (
    <section>
      <h3 className="section-h">Opportunities</h3>
      {opportunities.length === 0 ? (
        <p className="muted">Noch keine Opportunities.</p>
      ) : (
        <ul className="muted">
          {opportunities.map((o) => (
            <li key={o.id}>
              {o.variante} · {o.stage}
              {o.closed_at
                ? ` · closed ${new Date(o.closed_at).toLocaleDateString("de-DE")}`
                : ""}
            </li>
          ))}
        </ul>
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
            });
            if (res.error) {
              setError(res.error);
              return;
            }
            setError(null);
            router.refresh();
          });
        }}
      >
        <div className="grid-2">
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
