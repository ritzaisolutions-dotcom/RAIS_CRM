"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  companyBasicsSchema,
  companyQualificationSchema,
  createCompanySchema,
  listFieldsSchema,
  opportunitySchema,
  personSchema,
  pipelineChangeSchema,
  safeDatabaseError,
  touchpointSchema,
  voidTouchSchema,
  uuidSchema,
  validationError,
} from "@/lib/sales/validation";
import type {
  Abbruchgrund,
  CrmSystem,
  MitarbeiterKlasse,
  OppStage,
  OppVariante,
  PipelineStatus,
  Relationship,
  TouchErgebnis,
  TouchKanal,
} from "@/lib/sales/types";

type ActionResult<T extends object = Record<never, never>> =
  | ({ ok: true; error?: never } & T)
  | ({ error: string; ok?: never } & { [Key in keyof T]?: never });

function revalidateCompany(companyId: string) {
  revalidatePath(`/firma/${companyId}`);
  revalidatePath("/liste");
  revalidatePath("/kunden");
  revalidatePath("/analytics");
}

export async function updateCompanyQualification(
  companyId: string,
  patch: {
    mitarbeiterzahl: MitarbeiterKlasse | null;
    crm_system: CrmSystem | null;
    anfragen_pro_woche: number | null;
  },
): Promise<ActionResult> {
  const parsed = companyQualificationSchema.safeParse({ companyId, patch });
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({
      mitarbeiterzahl: parsed.data.patch.mitarbeiterzahl,
      crm_system: parsed.data.patch.crm_system,
      anfragen_pro_woche: parsed.data.patch.anfragen_pro_woche,
    })
    .eq("id", parsed.data.companyId)
    .select("id")
    .maybeSingle();
  if (error) {
    return { error: safeDatabaseError(error, "update-company-qualification") };
  }
  if (!data) return { error: "Firma nicht gefunden oder keine Berechtigung." };
  revalidateCompany(parsed.data.companyId);
  return { ok: true as const };
}

export async function updateCompanyBasics(
  companyId: string,
  patch: {
    name: string;
    stadt?: string | null;
    telefon?: string | null;
    website?: string | null;
    instagram_url?: string | null;
    facebook_url?: string | null;
    recherche?: string | null;
  },
): Promise<ActionResult> {
  const parsed = companyBasicsSchema.safeParse({ companyId, patch });
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({
      name: parsed.data.patch.name,
      stadt: parsed.data.patch.stadt || null,
      telefon: parsed.data.patch.telefon || null,
      website: parsed.data.patch.website || null,
      instagram_url: parsed.data.patch.instagram_url || null,
      facebook_url: parsed.data.patch.facebook_url || null,
      recherche: parsed.data.patch.recherche || null,
    })
    .eq("id", parsed.data.companyId)
    .select("id")
    .maybeSingle();
  if (error) return { error: safeDatabaseError(error, "update-company-basics") };
  if (!data) return { error: "Firma nicht gefunden oder keine Berechtigung." };
  revalidateCompany(parsed.data.companyId);
  return { ok: true as const };
}

export async function createCompany(input: {
  name: string;
  stadt?: string | null;
  telefon?: string | null;
  website?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  crm_system?: CrmSystem | null;
  anfragen_pro_woche?: number | null;
  pipeline_status?: PipelineStatus;
  person?: {
    name: string;
    email?: string | null;
    telefon?: string | null;
    linkedin_url?: string | null;
  } | null;
}): Promise<ActionResult<{ companyId: string }>> {
  const parsed = createCompanySchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { data: companyId, error } = await supabase.rpc("create_company", {
    p_name: parsed.data.name,
    p_stadt: parsed.data.stadt || null,
    p_telefon: parsed.data.telefon || null,
    p_website: parsed.data.website || null,
    p_instagram_url: parsed.data.instagram_url || null,
    p_facebook_url: parsed.data.facebook_url || null,
    p_crm_system: parsed.data.crm_system ?? null,
    p_anfragen_pro_woche: parsed.data.anfragen_pro_woche ?? null,
    p_pipeline_status: parsed.data.pipeline_status ?? "neu",
    p_person_name: parsed.data.person?.name ?? null,
    p_person_email: parsed.data.person?.email || null,
    p_person_telefon: parsed.data.person?.telefon || null,
    p_person_linkedin_url: parsed.data.person?.linkedin_url || null,
  });
  if (error) return { error: safeDatabaseError(error, "create-company") };
  if (!companyId) return { error: "Firma konnte nicht erstellt werden." };

  revalidatePath("/liste");
  revalidatePath("/kunden");
  revalidatePath("/analytics");
  return { ok: true as const, companyId };
}

export type SimilarCompany = {
  id: string;
  name: string;
  stadt: string | null;
  relationship: Relationship;
};

/**
 * Firmen mit ähnlichem Namen finden, bevor eine neue angelegt wird.
 *
 * Der Unique-Index greift nur bei exakter Übereinstimmung von
 * `lower(name)` + `lower(coalesce(stadt,''))`. "Müller Immobilien GmbH" neben
 * "Mueller Immobilien" läuft glatt durch, und wenn er doch greift, bekam der
 * Nutzer nur "Dieser Datensatz existiert bereits." — ohne Hinweis, welcher.
 * Firmen lassen sich nicht löschen, Duplikate bleiben also dauerhaft.
 */
export async function findSimilarCompanies(
  name: string,
): Promise<SimilarCompany[]> {
  const trimmed = name.trim();
  if (trimmed.length < 3) return [];

  // Rechtsform-Suffixe und Umlaute normalisieren, damit "Mueller GmbH" und
  // "Müller" denselben Kern liefern.
  const core = trimmed
    .toLowerCase()
    .replace(/\b(gmbh|ug|ag|kg|ohg|e\.?k\.?|mbh|co)\b/g, " ")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const token = core.split(" ").sort((a, b) => b.length - a.length)[0];
  if (!token || token.length < 3) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id,name,stadt,relationship")
    .ilike("name", `%${token.replace(/[%_]/g, "")}%`)
    .limit(5);
  if (error) return [];
  return (data ?? []) as SimilarCompany[];
}

export async function setExcluded(companyId: string): Promise<ActionResult> {
  return setListPipelineStatus({
    companyId,
    pipelineStatus: "disqualified",
    kanal: "status_change",
  });
}

export async function upsertPerson(input: {
  id?: string;
  company_id: string;
  name: string;
  rolle: string | null;
  email: string | null;
  telefon: string | null;
  linkedin_url: string | null;
  ist_entscheider: boolean;
}): Promise<ActionResult> {
  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_person_atomic", {
    p_person_id: parsed.data.id ?? null,
    p_company_id: parsed.data.company_id,
    p_name: parsed.data.name,
    p_rolle: parsed.data.rolle || null,
    p_email: parsed.data.email || null,
    p_telefon: parsed.data.telefon || null,
    p_linkedin_url: parsed.data.linkedin_url || null,
    p_ist_entscheider: parsed.data.ist_entscheider,
  });
  if (error) return { error: safeDatabaseError(error, "upsert-person") };
  revalidateCompany(parsed.data.company_id);
  return { ok: true as const };
}

export async function deletePerson(
  personId: string,
  companyId: string,
): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(personId);
  const parsedCompany = uuidSchema.safeParse(companyId);
  if (!parsed.success) return { error: validationError(parsed.error) };
  if (!parsedCompany.success) {
    return { error: validationError(parsedCompany.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .delete()
    .eq("id", parsed.data)
    .eq("company_id", parsedCompany.data)
    .select("id")
    .maybeSingle();
  if (error) return { error: safeDatabaseError(error, "delete-person") };
  if (!data) return { error: "Kontakt nicht gefunden oder keine Berechtigung." };
  revalidateCompany(parsedCompany.data);
  return { ok: true as const };
}

export async function insertTouchpoint(input: {
  company_id: string;
  person_id: string | null;
  kanal: TouchKanal;
  ergebnis: TouchErgebnis;
  notiz: string | null;
  naechster_touch: string | null;
  abbruchgrund: Abbruchgrund | null;
}): Promise<ActionResult> {
  const parsed = touchpointSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  // Über `log_touch` statt direktem INSERT: die RPC prüft, dass die Person
  // wirklich zur Firma gehört. Der frühere direkte Insert konnte einen
  // Touchpoint an die Person einer anderen Firma hängen — die Tabelle hat
  // keinen FK, der das Paar erzwingt. Das INSERT-Recht ist inzwischen entzogen.
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_touch", {
    p_company_id: parsed.data.company_id,
    p_kanal: parsed.data.kanal,
    p_ergebnis: parsed.data.ergebnis,
    p_person_id: parsed.data.person_id,
    p_notiz: parsed.data.notiz || null,
    p_naechster: parsed.data.naechster_touch || null,
    p_abbruch: parsed.data.abbruchgrund,
  });
  if (error) return { error: safeDatabaseError(error, "insert-touchpoint") };
  revalidateCompany(parsed.data.company_id);
  return { ok: true as const };
}

/** Fehleingabe stornieren — die Zeile bleibt, zählt aber in keiner KPI mehr. */
export async function voidTouchpoint(
  touchId: number,
  companyId: string,
  grund: string | null,
): Promise<ActionResult> {
  const parsed = voidTouchSchema.safeParse({ touchId, companyId, grund });
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_touch", {
    p_touch_id: parsed.data.touchId,
    p_grund: parsed.data.grund || null,
  });
  if (error) return { error: safeDatabaseError(error, "void-touchpoint") };
  revalidateCompany(parsed.data.companyId);
  revalidatePath("/analytics");
  return { ok: true as const };
}

export async function upsertOpportunity(input: {
  id?: string;
  company_id: string;
  variante: OppVariante;
  setup_preis: number | null;
  retainer_monatlich: number | null;
  stage: OppStage;
  close_grund: string | null;
}): Promise<ActionResult> {
  const parsed = opportunitySchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const isClosed =
    parsed.data.stage === "gewonnen" || parsed.data.stage === "verloren";

  const supabase = await createClient();
  if (parsed.data.id) {
    // Bereits gesetztes `closed_at` erhalten. Sonst würde jedes erneute
    // Speichern einer gewonnenen Opportunity das Abschlussdatum auf "jetzt"
    // verschieben und damit die Umsatz-Zuordnung im Analytics-Zeitraum ändern.
    const { data: current, error: readError } = await supabase
      .from("opportunities")
      .select("closed_at")
      .eq("id", parsed.data.id)
      .eq("company_id", parsed.data.company_id)
      .maybeSingle();
    if (readError) {
      return { error: safeDatabaseError(readError, "read-opportunity") };
    }
    if (!current) {
      return { error: "Opportunity nicht gefunden oder keine Berechtigung." };
    }

    const closed = isClosed
      ? (current.closed_at ?? new Date().toISOString())
      : null;

    const { data, error } = await supabase
      .from("opportunities")
      .update({
        variante: parsed.data.variante,
        setup_preis: parsed.data.setup_preis,
        retainer_monatlich: parsed.data.retainer_monatlich,
        stage: parsed.data.stage,
        close_grund: parsed.data.close_grund,
        closed_at: closed,
      })
      .eq("id", parsed.data.id)
      .eq("company_id", parsed.data.company_id)
      .select("id")
      .maybeSingle();
    if (error) return { error: safeDatabaseError(error, "update-opportunity") };
    if (!data) {
      return { error: "Opportunity nicht gefunden oder keine Berechtigung." };
    }
  } else {
    const { error } = await supabase.from("opportunities").insert({
      company_id: parsed.data.company_id,
      variante: parsed.data.variante,
      setup_preis: parsed.data.setup_preis,
      retainer_monatlich: parsed.data.retainer_monatlich,
      stage: parsed.data.stage,
      close_grund: parsed.data.close_grund,
      closed_at: isClosed ? new Date().toISOString() : null,
    });
    if (error) return { error: safeDatabaseError(error, "create-opportunity") };
  }
  revalidateCompany(parsed.data.company_id);
  return { ok: true as const };
}

export async function gdprAnonymize(
  companyId: string,
): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(companyId);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("gdpr_anonymize", {
    p_company_id: parsed.data,
  });
  if (error) return { error: safeDatabaseError(error, "gdpr-anonymize") };
  revalidateCompany(parsed.data);
  return { ok: true as const };
}

/** Set company pipeline status + append touch (Call/DM) for KPI honesty */
export async function setListPipelineStatus(input: {
  companyId: string;
  pipelineStatus: PipelineStatus;
  kanal?: Extract<TouchKanal, "call" | "dm" | "status_change">;
  naechsterTouch?: string | null;
}): Promise<
  ActionResult<{ naechster_touch: string | null; relationship: Relationship }>
> {
  const parsed = pipelineChangeSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_pipeline_status", {
    p_company_id: parsed.data.companyId,
    p_pipeline_status: parsed.data.pipelineStatus,
    p_kanal: parsed.data.kanal ?? "call",
    p_naechster_touch: parsed.data.naechsterTouch || null,
  });
  if (error) return { error: safeDatabaseError(error, "set-pipeline-status") };
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { error: "Pipeline-Status konnte nicht gespeichert werden." };
  }

  const relationship = data.relationship;
  const next = data.naechster_touch;
  if (
    (relationship !== "Prospect" &&
      relationship !== "Kunde" &&
      relationship !== "Ausgeschlossen") ||
    (next !== null && typeof next !== "string")
  ) {
    return { error: "Ungültige Antwort vom Datenbankdienst." };
  }

  revalidateCompany(parsed.data.companyId);
  revalidatePath("/analytics");
  return { ok: true as const, naechster_touch: next, relationship };
}

export async function updateListFields(
  companyId: string,
  patch: {
    crm_system?: CrmSystem | null;
    anfragen_pro_woche?: number | null;
    website?: string | null;
    instagram_url?: string | null;
    facebook_url?: string | null;
  },
): Promise<ActionResult> {
  const parsed = listFieldsSchema.safeParse({ companyId, patch });
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const update: {
    crm_system?: CrmSystem | null;
    anfragen_pro_woche?: number | null;
    website?: string | null;
    instagram_url?: string | null;
    facebook_url?: string | null;
  } = {};
  if ("crm_system" in parsed.data.patch) {
    update.crm_system = parsed.data.patch.crm_system ?? null;
  }
  if ("anfragen_pro_woche" in parsed.data.patch) {
    update.anfragen_pro_woche =
      parsed.data.patch.anfragen_pro_woche ?? null;
  }
  if ("website" in parsed.data.patch) {
    update.website = parsed.data.patch.website ?? null;
  }
  if ("instagram_url" in parsed.data.patch) {
    update.instagram_url = parsed.data.patch.instagram_url ?? null;
  }
  if ("facebook_url" in parsed.data.patch) {
    update.facebook_url = parsed.data.patch.facebook_url ?? null;
  }
  const { data, error } = await supabase
    .from("companies")
    .update(update)
    .eq("id", parsed.data.companyId)
    .select("id")
    .maybeSingle();
  if (error) return { error: safeDatabaseError(error, "update-list-fields") };
  if (!data) return { error: "Firma nicht gefunden oder keine Berechtigung." };
  revalidateCompany(parsed.data.companyId);
  return { ok: true as const };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
