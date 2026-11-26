"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, Ellipsis, Mail, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Panel, PanelHeader, SectionLabel } from "@/components/ui/panel";
import {
  CrmMenu,
  KategorieMenu,
  QuelleMenu,
  SocialButtons,
  StatusMenu,
} from "@/components/leads/LeadBits";
import { ActivityFeed } from "@/components/lead/ActivityFeed";
import { Composer, type ComposerTab } from "@/components/lead/Composer";
import { ContactsSection } from "@/components/lead/ContactsSection";
import { FieldRow, InlineField } from "@/components/lead/InlineField";
import { LeadSummary } from "@/components/lead/LeadSummary";
import { AsanaTaskButton } from "@/components/lead/AsanaTaskButton";
import { InviteDialog } from "@/components/lead/InviteDialog";
import {
  CustomFieldsSection,
  LeadBriefPanel,
  OppSection,
} from "@/components/CompanyDetail";
import { TaskDoneButton } from "@/components/followups/TaskDoneButton";
import {
  gdprAnonymize,
  logClickToCall,
  setExcluded,
  updateCompanyBasics,
  updateListFields,
} from "@/lib/sales/actions";
import { relativeDueLabel } from "@/lib/sales/leads";
import { placeCallHref } from "@/lib/sales/placeCall";
import {
  MITARBEITER_OPTIONS,
  type Company,
  type CustomFieldDef,
  type CustomFieldValue,
  type EmailTemplate,
  type MitarbeiterKlasse,
  type Opportunity,
  type Person,
  type SalesTask,
  type Touchpoint,
} from "@/lib/sales/types";
import { cn } from "@/lib/utils";

export function LeadDetail({
  company,
  people,
  touchpoints,
  touchpointsTotal,
  opportunities,
  tasks,
  templates,
  customDefs,
  customValues,
  senderName,
  nextTouch,
  contactCount,
  asanaConfigured = false,
  initialTab = "note",
}: {
  company: Company;
  people: Person[];
  touchpoints: Touchpoint[];
  touchpointsTotal: number;
  opportunities: Opportunity[];
  tasks: SalesTask[];
  templates: EmailTemplate[];
  customDefs: CustomFieldDef[];
  customValues: CustomFieldValue[];
  senderName: string | null;
  nextTouch: string | null;
  contactCount: number;
  asanaConfigured?: boolean;
  initialTab?: ComposerTab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ComposerTab>(initialTab);
  const [emailPersonId, setEmailPersonId] = useState<string | null>(null);
  const [adminPending, startAdmin] = useTransition();

  const main = people.find((p) => p.ist_entscheider) ?? people[0];
  const dialNumber = main?.telefon || company.telefon;
  const lastContact = touchpoints.find(
    (t) => !t.voided_at && ["call", "email", "dm", "sms", "meeting"].includes(t.kanal),
  );
  const openTasks = tasks.filter((t) => t.status === "offen");
  const excluded = company.relationship === "Ausgeschlossen";

  function saveBasics(patch: Partial<Pick<Company, "name" | "telefon">>) {
    return updateCompanyBasics(company.id, {
      name: patch.name ?? company.name,
      stadt: company.stadt,
      telefon: patch.telefon !== undefined ? patch.telefon : company.telefon,
      website: company.website,
      instagram_url: company.instagram_url,
      facebook_url: company.facebook_url,
      linkedin_url: company.linkedin_url,
      recherche: company.recherche,
      inserate_aktiv: company.inserate_aktiv,
      meta_ads: company.meta_ads,
    }).then((r) => {
      router.refresh();
      return r;
    });
  }

  function saveList(patch: Parameters<typeof updateListFields>[1]) {
    return updateListFields(company.id, patch).then((r) => {
      router.refresh();
      return r;
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Kopfzeile */}
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={company.relationship === "Kunde" ? "/leads?view=kunden" : "/leads"} aria-label="Zurück zu den Leads">
            <ChevronLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold leading-tight">{company.name}</h1>
          <p className="flex items-center gap-1 text-xs text-fg-muted">
            {company.stadt ? (
              <>
                <MapPin className="size-3" />
                {company.stadt}
              </>
            ) : (
              "Keine Stadt"
            )}
            {company.relationship === "Kunde" ? <Badge tone="green" className="ml-1">Kunde</Badge> : null}
            {excluded ? <Badge tone="red" className="ml-1">Ausgeschlossen</Badge> : null}
          </p>
        </div>
        <StatusMenu companyId={company.id} status={company.pipeline_status} size="md" />
        <div className="ml-auto flex items-center gap-2">
          {dialNumber ? (
            <Button size="sm" asChild>
              <a
                href={placeCallHref(dialNumber)}
                onClick={() => {
                  void logClickToCall({
                    company_id: company.id,
                    person_id: main?.telefon ? main.id : null,
                    telefon: dialNumber,
                  });
                  setTab("call");
                }}
              >
                <Phone />
                Anrufen
              </a>
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEmailPersonId(null);
              setTab("email");
            }}
          >
            <Mail />
            E-Mail
          </Button>
          <InviteDialog
            companyId={company.id}
            companyName={company.name}
            stadt={company.stadt}
            website={company.website}
            people={people}
            senderName={senderName}
            asanaConfigured={asanaConfigured}
          />
          <AsanaTaskButton
            companyId={company.id}
            companyName={company.name}
            configured={asanaConfigured}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Weitere Aktionen" disabled={adminPending}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Gefahrenzone</DropdownMenuLabel>
              {!excluded ? (
                <DropdownMenuItem
                  onSelect={() =>
                    startAdmin(async () => {
                      if (!confirm("Lead ausschließen? Er verschwindet aus den aktiven Ansichten (bleibt unter „Kein Interesse“).")) return;
                      const res = await setExcluded(company.id);
                      if (res.error) alert(res.error);
                      router.refresh();
                    })
                  }
                >
                  Ausschließen
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                destructive
                onSelect={() =>
                  startAdmin(async () => {
                    if (!confirm("DSGVO Art. 17: Personendaten unwiderruflich anonymisieren? Nur bei Löschbegehren.")) return;
                    if (prompt('Zur Bestätigung "ANONYMISIEREN" eingeben') !== "ANONYMISIEREN") return;
                    const res = await gdprAnonymize(company.id);
                    if (res.error) alert(res.error);
                    router.refresh();
                  })
                }
              >
                DSGVO anonymisieren…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        {/* Links: Steckbrief */}
        <aside className="space-y-5 border-line bg-surface px-4 py-4 lg:overflow-y-auto lg:border-r">
          {/* Ansprechpartner zuerst: Telefon, E-Mail und Kontext sind das, was man im Gespräch braucht. */}
          <ContactsSection
            companyId={company.id}
            people={people}
            onEmail={(id) => {
              setEmailPersonId(id);
              setTab("email");
            }}
          />

          <section className="space-y-0.5">
            <SectionLabel className="mb-1">Akquise</SectionLabel>
            <FieldRow label="Kategorie">
              <KategorieMenu companyId={company.id} kategorie={company.kategorie} relationship={company.relationship} />
            </FieldRow>
            <FieldRow label="CRM">
              <CrmMenu companyId={company.id} crm={company.crm_system} />
            </FieldRow>
          </section>

          <section className="space-y-2">
            <SectionLabel>Links</SectionLabel>
            <SocialButtons
              companyId={company.id}
              links={{
                website: company.website,
                linkedin_url: company.linkedin_url,
                xing_url: company.xing_url,
                instagram_url: company.instagram_url,
                facebook_url: company.facebook_url,
                youtube_url: company.youtube_url,
                tiktok_url: company.tiktok_url,
              }}
            />
          </section>

          <section>
            <SectionLabel className="mb-1">Details</SectionLabel>
            <InlineField label="Firma" value={company.name} onSave={(v) => (v ? saveBasics({ name: v }) : Promise.resolve({ error: "Name ist Pflicht" }))} />
            <InlineField label="Stadt" value={company.stadt} onSave={(v) => saveList({ stadt: v })} />
            <InlineField
              label="Telefon Zentrale"
              type="tel"
              value={company.telefon}
              display={company.telefon ? <a href={placeCallHref(company.telefon)} onClick={(e) => e.stopPropagation()} className="hover:underline">{company.telefon}</a> : undefined}
              onSave={(v) => saveBasics({ telefon: v })}
            />
            <InlineField
              label="Aktive Inserate"
              type="number"
              value={company.inserate_aktiv != null ? String(company.inserate_aktiv) : null}
              onSave={(v) => saveList({ inserate_aktiv: v ? Math.max(0, Math.floor(Number(v))) : null })}
            />
            <InlineField
              label="Mitarbeiter"
              type="select"
              value={company.mitarbeiterzahl}
              options={MITARBEITER_OPTIONS.map((c) => ({ value: c, label: c }))}
              onSave={(v) => saveList({ mitarbeiterzahl: (v as MitarbeiterKlasse) || null })}
            />
            <InlineField
              label="Meta Ads"
              type="select"
              value={company.meta_ads == null ? null : company.meta_ads ? "ja" : "nein"}
              options={[
                { value: "ja", label: "Ja" },
                { value: "nein", label: "Nein" },
              ]}
              onSave={(v) => saveList({ meta_ads: v === "ja" ? true : v === "nein" ? false : null })}
            />
            <FieldRow label="Quelle">
              <QuelleMenu companyId={company.id} quelle={company.quelle} />
            </FieldRow>
          </section>

          {customDefs.length > 0 ? (
            <section className="space-y-2">
              <SectionLabel>Eigene Felder</SectionLabel>
              <CustomFieldsSection companyId={company.id} defs={customDefs} values={customValues} />
            </section>
          ) : null}
        </aside>

        {/* Mitte: Composer + Aktivität */}
        <main className="min-w-0 space-y-5 bg-bg px-4 py-4 lg:overflow-y-auto lg:px-6">
          <LeadSummary
            companyId={company.id}
            status={company.pipeline_status}
            nextTouch={nextTouch}
            contactCount={contactCount}
            lastContactAt={lastContact?.occurred_at ?? null}
            persona={company.persona}
            touchpoints={touchpoints}
            mainPersonId={main?.id ?? null}
          />
          <Composer
            lead={{
              companyId: company.id,
              name: company.name,
              stadt: company.stadt,
              website: company.website,
              status: company.pipeline_status,
            }}
            people={people}
            templates={templates}
            senderName={senderName}
            tab={tab}
            onTabChange={setTab}
            emailPersonId={emailPersonId}
            asanaConfigured={asanaConfigured}
          />
          <section>
            <SectionLabel className="mb-3">Aktivität</SectionLabel>
            <ActivityFeed
              touchpoints={touchpoints}
              total={touchpointsTotal}
              people={people}
              companyId={company.id}
            />
          </section>
        </main>

        {/* Rechts: Aufgaben, Opportunity, Recherche */}
        <aside className="space-y-4 border-line bg-bg px-4 py-4 lg:col-span-2 lg:border-t xl:col-span-1 xl:overflow-y-auto xl:border-l xl:border-t-0">
          <Panel>
            <PanelHeader
              title={`Aufgaben${openTasks.length ? ` · ${openTasks.length}` : ""}`}
              actions={
                <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => setTab("task")}>
                  Neu
                </Button>
              }
            />
            {openTasks.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-fg-subtle">Keine offenen Aufgaben.</p>
            ) : (
              <ul className="divide-y divide-line">
                {openTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">{t.titel}</div>
                      <div className="text-xs text-fg-subtle">{relativeDueLabel(t.due_on)}</div>
                    </div>
                    <TaskDoneButton taskId={t.id} companyId={company.id} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Recherche" description="Freitext zur Firma" />
            <RechercheBox company={company} onSave={(recherche) =>
              updateCompanyBasics(company.id, {
                name: company.name,
                stadt: company.stadt,
                telefon: company.telefon,
                website: company.website,
                instagram_url: company.instagram_url,
                facebook_url: company.facebook_url,
                linkedin_url: company.linkedin_url,
                recherche,
                inserate_aktiv: company.inserate_aktiv,
                meta_ads: company.meta_ads,
              }).then((r) => {
                router.refresh();
                return r;
              })
            } />
            <div className="border-t border-line px-4 pb-3">
              <LeadBriefPanel company={company} />
            </div>
          </Panel>

          <details className="group rounded-lg border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-[13px] font-semibold">
              Opportunity{opportunities.length ? ` · ${opportunities.length}` : ""}
              <span className="text-xs font-normal text-fg-subtle group-open:hidden">anzeigen</span>
            </summary>
            <div className="border-t border-line px-4 py-3">
              <OppSection companyId={company.id} opportunities={opportunities} />
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}

function RechercheBox({
  company,
  onSave,
}: {
  company: Company;
  onSave: (v: string | null) => Promise<{ error?: string }>;
}) {
  const [value, setValue] = useState(company.recherche ?? "");
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const dirty = value !== (company.recherche ?? "");
  return (
    <div className="space-y-2 px-4 py-3">
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        rows={5}
        placeholder="Was wir über die Firma wissen: Angriffspunkte, Team, Software …"
        className="w-full resize-y rounded-md border border-line-strong bg-surface px-2.5 py-2 text-[13px] leading-relaxed outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft"
      />
      <div className="flex items-center justify-end gap-2">
        {state === "saved" ? <span className="text-xs text-[var(--tone-green-fg)]">Gespeichert</span> : null}
        {state === "error" ? <span className="text-xs text-[var(--tone-red-fg)]">Fehler beim Speichern</span> : null}
        <Button
          size="sm"
          variant="secondary"
          disabled={!dirty || pending}
          className={cn(!dirty && "invisible")}
          onClick={() =>
            start(async () => {
              const res = await onSave(value.trim() || null);
              setState(res.error ? "error" : "saved");
            })
          }
        >
          Speichern
        </Button>
      </div>
    </div>
  );
}
