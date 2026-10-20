"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { businessToday, addBusinessDays } from "@/lib/sales/dates";
import {
  deliverQueuedEmail,
  drainQueuedEmails,
} from "@/lib/sales/deliverEmail";
import { syncInboundEmail } from "@/lib/sales/inboundEmail";
import {
  getSmtpConfig,
  imapConfigured,
  sendSmtpMail,
  smtpConfigured,
} from "@/lib/sales/mail";
import { searchGlobal } from "@/lib/sales/queries";
import { createClient } from "@/lib/supabase/server";
import {
  bulkPipelineSchema,
  companyBasicsSchema,
  companyQualificationSchema,
  createCompanySchema,
  customFieldDefSchema,
  customFieldValueSchema,
  emailTemplateSchema,
  enrollSequenceSchema,
  importCompanyRowSchema,
  listFieldsSchema,
  opportunitySchema,
  personSchema,
  pipelineChangeSchema,
  safeDatabaseError,
  savedViewSchema,
  sendEmailSchema,
  sendSmsSchema,
  sequenceSchema,
  sequenceStepSchema,
  taskSchema,
  touchpointSchema,
  voidTouchSchema,
  uuidSchema,
  validationError,
  workflowRuleSchema,
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
  revalidatePath("/termine");
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
    linkedin_url?: string | null;
    recherche?: string | null;
    inserate_aktiv?: number | null;
    meta_ads?: boolean | null;
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
      linkedin_url: parsed.data.patch.linkedin_url || null,
      recherche: parsed.data.patch.recherche || null,
      ...(parsed.data.patch.inserate_aktiv !== undefined
        ? { inserate_aktiv: parsed.data.patch.inserate_aktiv }
        : {}),
      ...(parsed.data.patch.meta_ads !== undefined
        ? { meta_ads: parsed.data.patch.meta_ads }
        : {}),
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
  titel?: string | null;
  erwarteter_umsatz?: number | null;
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
        titel: parsed.data.titel || null,
        erwarteter_umsatz: parsed.data.erwarteter_umsatz ?? null,
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
      titel: parsed.data.titel || null,
      erwarteter_umsatz: parsed.data.erwarteter_umsatz ?? null,
    });
    if (error) return { error: safeDatabaseError(error, "create-opportunity") };
  }
  revalidateCompany(parsed.data.company_id);
  return { ok: true as const };
}

export async function createTask(input: {
  company_id: string;
  titel: string;
  due_on: string;
  person_id?: string | null;
  notiz?: string | null;
  art?: "follow_up" | "email" | "sonstiges";
  email_preset?: "info" | "ueber_uns" | "frei" | null;
  set_naechster?: boolean;
}): Promise<ActionResult<{ taskId: string }>> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_task", {
    p_company_id: parsed.data.company_id,
    p_titel: parsed.data.titel,
    p_due_on: parsed.data.due_on,
    p_person_id: parsed.data.person_id ?? null,
    p_notiz: parsed.data.notiz || null,
    p_art: parsed.data.art ?? "follow_up",
    p_email_preset: parsed.data.email_preset ?? null,
    p_set_naechster: parsed.data.set_naechster ?? null,
  });
  if (error) return { error: safeDatabaseError(error, "create-task") };
  if (!data) return { error: "Aufgabe konnte nicht angelegt werden." };
  revalidateCompany(parsed.data.company_id);
  revalidatePath("/todos");
  return { ok: true as const, taskId: data as string };
}

export async function completeTask(
  taskId: string,
  companyId: string,
): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(taskId);
  const parsedCompany = uuidSchema.safeParse(companyId);
  if (!parsed.success) return { error: validationError(parsed.error) };
  if (!parsedCompany.success) {
    return { error: validationError(parsedCompany.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_task", {
    p_task_id: parsed.data,
  });
  if (error) return { error: safeDatabaseError(error, "complete-task") };
  revalidateCompany(parsedCompany.data);
  revalidatePath("/liste");
  revalidatePath("/todos");
  return { ok: true as const };
}

export async function upsertEmailTemplate(input: {
  id?: string;
  name: string;
  subject: string;
  body: string;
}): Promise<ActionResult> {
  const parsed = emailTemplateSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  if (parsed.data.id) {
    const { error } = await supabase
      .from("email_templates")
      .update({
        name: parsed.data.name,
        subject: parsed.data.subject,
        body: parsed.data.body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.id);
    if (error) return { error: safeDatabaseError(error, "update-email-template") };
  } else {
    const { error } = await supabase.from("email_templates").insert({
      name: parsed.data.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
    });
    if (error) return { error: safeDatabaseError(error, "create-email-template") };
  }
  revalidatePath("/einstellungen");
  return { ok: true as const };
}

export async function deleteEmailTemplate(id: string): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .delete()
    .eq("id", parsed.data);
  if (error) return { error: safeDatabaseError(error, "delete-email-template") };
  revalidatePath("/einstellungen");
  return { ok: true as const };
}

/**
 * Queues an outbound email, attempts SMTP delivery, logs a timeline touch.
 */
export async function sendCompanyEmail(input: {
  company_id: string;
  person_id?: string | null;
  to_email: string;
  subject: string;
  body: string;
  template_id?: string | null;
}): Promise<ActionResult<{ status: string }>> {
  const parsed = sendEmailSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();

  const { data: inserted, error: insertError } = await supabase
    .from("email_messages")
    .insert({
      company_id: parsed.data.company_id,
      person_id: parsed.data.person_id ?? null,
      template_id: parsed.data.template_id ?? null,
      direction: "outbound",
      to_email: parsed.data.to_email,
      subject: parsed.data.subject,
      body: parsed.data.body,
      status: "queued",
      error: null,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return { error: safeDatabaseError(insertError, "queue-email") };
  }

  const delivered = await deliverQueuedEmail(supabase, inserted.id);
  const status = delivered.ok ? delivered.status : "failed";

  const statusNote =
    status === "sent"
      ? "gesendet"
      : status === "failed"
        ? "fehlgeschlagen"
        : "Warteschlange";

  const { error: touchError } = await supabase.rpc("log_touch", {
    p_company_id: parsed.data.company_id,
    p_kanal: "email",
    p_ergebnis: "kein_ergebnis",
    p_person_id: parsed.data.person_id ?? null,
    p_notiz: `E-Mail (${statusNote}) an ${parsed.data.to_email}: ${parsed.data.subject}\n\n${parsed.data.body}`,
    p_naechster: null,
    p_abbruch: null,
  });
  if (touchError) {
    return { error: safeDatabaseError(touchError, "email-touch") };
  }
  revalidateCompany(parsed.data.company_id);
  return { ok: true as const, status };
}

export async function testSmtpConnection(
  toEmail?: string,
): Promise<ActionResult<{ message: string }>> {
  if (!smtpConfigured()) {
    return {
      error:
        "SMTP nicht konfiguriert. Setze SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM in der Umgebung.",
    };
  }
  const cfg = getSmtpConfig()!;
  const to = toEmail?.trim() || cfg.user;
  const result = await sendSmtpMail({
    to,
    subject: "RAIS CRM — SMTP-Test",
    text: "SMTP-Verbindung funktioniert.",
  });
  if (!result.ok) return { error: result.error };
  return {
    ok: true as const,
    message: `Testmail an ${to} gesendet.`,
  };
}

export async function getConnectionStatus(): Promise<{
  smtp: boolean;
  imap: boolean;
  cronSecret: boolean;
  serviceRole: boolean;
  imapLastSync: string | null;
  imapLastError: string | null;
}> {
  let imapLastSync: string | null = null;
  let imapLastError: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "imap_sync")
      .maybeSingle();
    const val = data?.value as
      | { last_sync_at?: string; last_error?: string }
      | null;
    imapLastSync = val?.last_sync_at ?? null;
    imapLastError = val?.last_error ?? null;
  } catch {
    // table may be missing before migration
  }
  return {
    smtp: smtpConfigured(),
    imap: imapConfigured(),
    cronSecret: Boolean(process.env.CRON_SECRET?.trim()),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    imapLastSync,
    imapLastError,
  };
}

export async function sendCompanySms(input: {
  company_id: string;
  person_id?: string | null;
  to_phone: string;
  body: string;
}): Promise<ActionResult> {
  const parsed = sendSmsSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();

  const { error: insertError } = await supabase.from("sms_messages").insert({
    company_id: parsed.data.company_id,
    person_id: parsed.data.person_id ?? null,
    direction: "outbound",
    to_phone: parsed.data.to_phone,
    body: parsed.data.body,
    status: process.env.SMS_PROVIDER_URL ? "queued" : "queued",
  });
  if (insertError) {
    return { error: safeDatabaseError(insertError, "queue-sms") };
  }

  const { error: touchError } = await supabase.rpc("log_touch", {
    p_company_id: parsed.data.company_id,
    p_kanal: "sms",
    p_ergebnis: "kein_ergebnis",
    p_person_id: parsed.data.person_id ?? null,
    p_notiz: `SMS an ${parsed.data.to_phone}: ${parsed.data.body}`,
    p_naechster: null,
    p_abbruch: null,
  });
  if (touchError) return { error: safeDatabaseError(touchError, "sms-touch") };
  revalidateCompany(parsed.data.company_id);
  return { ok: true as const };
}

export async function logClickToCall(input: {
  company_id: string;
  person_id?: string | null;
  telefon: string;
}): Promise<ActionResult> {
  const companyId = uuidSchema.safeParse(input.company_id);
  if (!companyId.success) return { error: validationError(companyId.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_touch", {
    p_company_id: companyId.data,
    p_kanal: "call",
    p_ergebnis: "kein_ergebnis",
    p_person_id: input.person_id ?? null,
    p_notiz: `Click-to-Call gestartet: ${input.telefon}`,
    p_naechster: null,
    p_abbruch: null,
  });
  if (error) return { error: safeDatabaseError(error, "click-to-call") };
  revalidateCompany(companyId.data);
  return { ok: true as const };
}

export async function upsertSequence(input: {
  id?: string;
  name: string;
  active?: boolean;
}): Promise<ActionResult<{ sequenceId: string }>> {
  const parsed = sequenceSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  if (parsed.data.id) {
    const { error } = await supabase
      .from("sequences")
      .update({
        name: parsed.data.name,
        active: parsed.data.active ?? true,
      })
      .eq("id", parsed.data.id);
    if (error) return { error: safeDatabaseError(error, "update-sequence") };
    revalidatePath("/einstellungen");
    return { ok: true as const, sequenceId: parsed.data.id };
  }
  const { data, error } = await supabase
    .from("sequences")
    .insert({
      name: parsed.data.name,
      active: parsed.data.active ?? true,
    })
    .select("id")
    .single();
  if (error) return { error: safeDatabaseError(error, "create-sequence") };
  revalidatePath("/einstellungen");
  return { ok: true as const, sequenceId: data.id };
}

export async function upsertSequenceStep(input: {
  sequence_id: string;
  step_order: number;
  kanal: "email" | "call" | "sms" | "task";
  delay_days: number;
  subject?: string | null;
  body?: string | null;
  task_titel?: string | null;
}): Promise<ActionResult> {
  const parsed = sequenceStepSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("sequence_steps").upsert(
    {
      sequence_id: parsed.data.sequence_id,
      step_order: parsed.data.step_order,
      kanal: parsed.data.kanal,
      delay_days: parsed.data.delay_days,
      subject: parsed.data.subject || null,
      body: parsed.data.body || null,
      task_titel: parsed.data.task_titel || null,
    },
    { onConflict: "sequence_id,step_order" },
  );
  if (error) return { error: safeDatabaseError(error, "upsert-sequence-step") };
  revalidatePath("/einstellungen");
  return { ok: true as const };
}

export async function enrollInSequence(input: {
  sequence_id: string;
  company_id: string;
  person_id?: string | null;
}): Promise<ActionResult> {
  const parsed = enrollSequenceSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  const { data: firstStep } = await supabase
    .from("sequence_steps")
    .select("delay_days")
    .eq("sequence_id", parsed.data.sequence_id)
    .order("step_order")
    .limit(1)
    .maybeSingle();

  const delay = firstStep?.delay_days ?? 0;
  const nextRun = addBusinessDays(businessToday(), delay);

  const { error } = await supabase.from("sequence_enrollments").insert({
    sequence_id: parsed.data.sequence_id,
    company_id: parsed.data.company_id,
    person_id: parsed.data.person_id ?? null,
    status: "aktiv",
    current_step: 0,
    next_run_on: nextRun,
  });
  if (error) return { error: safeDatabaseError(error, "enroll-sequence") };
  revalidateCompany(parsed.data.company_id);
  return { ok: true as const };
}

/** Process enrollments whose next_run_on is due (Berlin calendar). */
export async function runDueSequenceSteps(): Promise<
  ActionResult<{ ran: number; drained: { sent: number; failed: number } }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("run_due_sequence_steps");
  if (error) return { error: safeDatabaseError(error, "run-sequences") };
  const drained = await drainQueuedEmails(supabase);
  revalidatePath("/liste");
  revalidatePath("/einstellungen");
  return {
    ok: true as const,
    ran: typeof data === "number" ? data : 0,
    drained: { sent: drained.sent, failed: drained.failed },
  };
}

export async function runInboundEmailSyncAction(): Promise<
  ActionResult<{ matched: number; quarantined: number }>
> {
  const supabase = await createClient();
  const result = await syncInboundEmail(supabase);
  if (result.error && result.matched === 0 && result.quarantined === 0) {
    return { error: result.error };
  }
  revalidatePath("/einstellungen");
  revalidatePath("/liste");
  return {
    ok: true as const,
    matched: result.matched,
    quarantined: result.quarantined,
  };
}

export async function pauseSequenceEnrollment(
  enrollmentId: string,
  companyId: string,
): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(enrollmentId);
  const company = uuidSchema.safeParse(companyId);
  if (!parsed.success) return { error: validationError(parsed.error) };
  if (!company.success) return { error: validationError(company.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("sequence_enrollments")
    .update({ status: "pausiert" })
    .eq("id", parsed.data)
    .eq("company_id", company.data);
  if (error) return { error: safeDatabaseError(error, "pause-enrollment") };
  revalidateCompany(company.data);
  return { ok: true as const };
}

export async function resumeSequenceEnrollment(
  enrollmentId: string,
  companyId: string,
): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(enrollmentId);
  const company = uuidSchema.safeParse(companyId);
  if (!parsed.success) return { error: validationError(parsed.error) };
  if (!company.success) return { error: validationError(company.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("sequence_enrollments")
    .update({ status: "aktiv" })
    .eq("id", parsed.data)
    .eq("company_id", company.data);
  if (error) return { error: safeDatabaseError(error, "resume-enrollment") };
  revalidateCompany(company.data);
  return { ok: true as const };
}

export async function stopSequenceEnrollment(
  enrollmentId: string,
  companyId: string,
): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(enrollmentId);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("sequence_enrollments")
    .update({ status: "gestoppt", stop_reason: "Manuell gestoppt" })
    .eq("id", parsed.data);
  if (error) return { error: safeDatabaseError(error, "stop-enrollment") };
  revalidateCompany(companyId);
  return { ok: true as const };
}

export async function upsertWorkflowRule(input: {
  id?: string;
  name: string;
  active?: boolean;
  trigger_pipeline_status: PipelineStatus;
  task_titel: string;
  task_due_days: number;
}): Promise<ActionResult> {
  const parsed = workflowRuleSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  if (parsed.data.id) {
    const { error } = await supabase
      .from("workflow_rules")
      .update({
        name: parsed.data.name,
        active: parsed.data.active ?? true,
        trigger_pipeline_status: parsed.data.trigger_pipeline_status,
        task_titel: parsed.data.task_titel,
        task_due_days: parsed.data.task_due_days,
      })
      .eq("id", parsed.data.id);
    if (error) return { error: safeDatabaseError(error, "update-workflow") };
  } else {
    const { error } = await supabase.from("workflow_rules").insert({
      name: parsed.data.name,
      active: parsed.data.active ?? true,
      trigger_pipeline_status: parsed.data.trigger_pipeline_status,
      task_titel: parsed.data.task_titel,
      task_due_days: parsed.data.task_due_days,
    });
    if (error) return { error: safeDatabaseError(error, "create-workflow") };
  }
  revalidatePath("/einstellungen");
  return { ok: true as const };
}

export async function deleteWorkflowRule(id: string): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("workflow_rules")
    .delete()
    .eq("id", parsed.data);
  if (error) return { error: safeDatabaseError(error, "delete-workflow") };
  revalidatePath("/einstellungen");
  return { ok: true as const };
}

export async function upsertSavedView(input: {
  id?: string;
  name: string;
  scope: "liste" | "kunden";
  filters: {
    status?: string;
    due?: string;
    q?: string;
    sort?: string;
  };
}): Promise<ActionResult> {
  const parsed = savedViewSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  if (parsed.data.id) {
    const { error } = await supabase
      .from("saved_views")
      .update({
        name: parsed.data.name,
        scope: parsed.data.scope,
        filters: parsed.data.filters,
      })
      .eq("id", parsed.data.id);
    if (error) return { error: safeDatabaseError(error, "update-saved-view") };
  } else {
    const { error } = await supabase.from("saved_views").insert({
      name: parsed.data.name,
      scope: parsed.data.scope,
      filters: parsed.data.filters,
    });
    if (error) return { error: safeDatabaseError(error, "create-saved-view") };
  }
  revalidatePath("/liste");
  return { ok: true as const };
}

export async function deleteSavedView(id: string): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("saved_views")
    .delete()
    .eq("id", parsed.data);
  if (error) return { error: safeDatabaseError(error, "delete-saved-view") };
  revalidatePath("/liste");
  return { ok: true as const };
}

export async function upsertLeadList(input: {
  id?: string;
  name: string;
}): Promise<ActionResult<{ listId: string }>> {
  const name = z.string().trim().min(1).max(80).safeParse(input.name);
  if (!name.success) return { error: validationError(name.error) };
  const supabase = await createClient();
  if (input.id) {
    const id = uuidSchema.safeParse(input.id);
    if (!id.success) return { error: validationError(id.error) };
    const { error } = await supabase
      .from("lead_lists")
      .update({ name: name.data })
      .eq("id", id.data);
    if (error) return { error: safeDatabaseError(error, "update-lead-list") };
    revalidatePath("/liste");
    revalidatePath("/termine");
    return { ok: true as const, listId: id.data };
  }
  const { data, error } = await supabase
    .from("lead_lists")
    .insert({ name: name.data })
    .select("id")
    .single();
  if (error) return { error: safeDatabaseError(error, "create-lead-list") };
  revalidatePath("/liste");
  revalidatePath("/termine");
  return { ok: true as const, listId: data.id };
}

export async function deleteLeadList(id: string): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_lists")
    .delete()
    .eq("id", parsed.data);
  if (error) return { error: safeDatabaseError(error, "delete-lead-list") };
  revalidatePath("/liste");
  revalidatePath("/termine");
  return { ok: true as const };
}

export async function addCompaniesToList(input: {
  listId: string;
  companyIds: string[];
}): Promise<ActionResult<{ added: number }>> {
  const listId = uuidSchema.safeParse(input.listId);
  if (!listId.success) return { error: validationError(listId.error) };
  const ids = z.array(uuidSchema).min(1).max(100).safeParse(input.companyIds);
  if (!ids.success) return { error: validationError(ids.error) };
  const supabase = await createClient();
  const rows = ids.data.map((company_id) => ({
    list_id: listId.data,
    company_id,
  }));
  const { error } = await supabase
    .from("lead_list_members")
    .upsert(rows, { onConflict: "list_id,company_id" });
  if (error) return { error: safeDatabaseError(error, "add-to-list") };
  revalidatePath("/liste");
  revalidatePath("/termine");
  return { ok: true as const, added: rows.length };
}

export async function removeCompaniesFromList(input: {
  listId: string;
  companyIds: string[];
}): Promise<ActionResult<{ removed: number }>> {
  const listId = uuidSchema.safeParse(input.listId);
  if (!listId.success) return { error: validationError(listId.error) };
  const ids = z.array(uuidSchema).min(1).max(100).safeParse(input.companyIds);
  if (!ids.success) return { error: validationError(ids.error) };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("lead_list_members")
    .delete({ count: "exact" })
    .eq("list_id", listId.data)
    .in("company_id", ids.data);
  if (error) return { error: safeDatabaseError(error, "remove-from-list") };
  revalidatePath("/liste");
  revalidatePath("/termine");
  return { ok: true as const, removed: count ?? ids.data.length };
}

export async function setCompanyListMembership(input: {
  companyId: string;
  listIds: string[];
}): Promise<ActionResult> {
  const companyId = uuidSchema.safeParse(input.companyId);
  if (!companyId.success) return { error: validationError(companyId.error) };
  const listIds = z.array(uuidSchema).max(50).safeParse(input.listIds);
  if (!listIds.success) return { error: validationError(listIds.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_company_list_membership", {
    p_company_id: companyId.data,
    p_list_ids: listIds.data,
  });
  if (error) return { error: safeDatabaseError(error, "set-list-membership") };
  revalidateCompany(companyId.data);
  return { ok: true as const };
}

export async function bulkSetPipelineStatus(input: {
  companyIds: string[];
  pipelineStatus: PipelineStatus;
  kanal?: Extract<TouchKanal, "call" | "dm" | "status_change">;
  naechsterTouch?: string | null;
}): Promise<ActionResult<{ updated: number }>> {
  const parsed = bulkPipelineSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  let updated = 0;
  for (const companyId of parsed.data.companyIds) {
    const res = await setListPipelineStatus({
      companyId,
      pipelineStatus: parsed.data.pipelineStatus,
      kanal: parsed.data.kanal,
      naechsterTouch: parsed.data.naechsterTouch,
    });
    if (!res.error) updated += 1;
  }
  revalidatePath("/liste");
  revalidatePath("/termine");
  revalidatePath("/kunden");
  revalidatePath("/analytics");
  return { ok: true as const, updated };
}

export async function bulkEnrollInSequence(input: {
  companyIds: string[];
  sequence_id: string;
}): Promise<ActionResult<{ enrolled: number }>> {
  const sequenceId = uuidSchema.safeParse(input.sequence_id);
  if (!sequenceId.success) return { error: validationError(sequenceId.error) };
  const ids = z
    .array(uuidSchema)
    .min(1)
    .max(100)
    .safeParse(input.companyIds);
  if (!ids.success) return { error: validationError(ids.error) };

  let enrolled = 0;
  for (const companyId of ids.data) {
    const res = await enrollInSequence({
      sequence_id: sequenceId.data,
      company_id: companyId,
    });
    if (!res.error) enrolled += 1;
  }
  revalidatePath("/liste");
  return { ok: true as const, enrolled };
}

export async function bulkCreateFollowUpTasks(input: {
  companyIds: string[];
  titel: string;
  due_on: string;
}): Promise<ActionResult<{ created: number }>> {
  const ids = z
    .array(uuidSchema)
    .min(1)
    .max(100)
    .safeParse(input.companyIds);
  if (!ids.success) return { error: validationError(ids.error) };
  const titel = z.string().trim().min(1).max(200).safeParse(input.titel);
  if (!titel.success) return { error: validationError(titel.error) };
  const due = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(input.due_on);
  if (!due.success) return { error: "Ungültiges Fälligkeitsdatum." };

  let created = 0;
  for (const companyId of ids.data) {
    const res = await createTask({
      company_id: companyId,
      titel: titel.data,
      due_on: due.data,
      art: "follow_up",
      set_naechster: true,
    });
    if (!res.error) created += 1;
  }
  revalidatePath("/liste");
  revalidatePath("/todos");
  return { ok: true as const, created };
}

export async function searchActivityAction(
  term: string,
): Promise<ActionResult<{ hits: Awaited<ReturnType<typeof searchGlobal>> }>> {
  const hits = await searchGlobal(term);
  return { ok: true as const, hits };
}

export async function resolveInboundQuarantine(input: {
  quarantineId: string;
  companyId: string;
}): Promise<ActionResult> {
  const qId = uuidSchema.safeParse(input.quarantineId);
  const companyId = uuidSchema.safeParse(input.companyId);
  if (!qId.success) return { error: validationError(qId.error) };
  if (!companyId.success) return { error: validationError(companyId.error) };

  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from("inbound_email_quarantine")
    .select("*")
    .eq("id", qId.data)
    .is("resolved_at", null)
    .maybeSingle();
  if (readErr) return { error: safeDatabaseError(readErr, "read-quarantine") };
  if (!row) return { error: "Eintrag nicht gefunden oder bereits zugeordnet." };

  const { error: insertErr } = await supabase.from("email_messages").insert({
    company_id: companyId.data,
    person_id: null,
    template_id: null,
    direction: "inbound",
    to_email: process.env.IMAP_USER?.trim() || "inbox",
    subject: row.subject ?? "(ohne Betreff)",
    body: row.body ?? "",
    status: "received",
    provider_ref: row.provider_ref,
    error: null,
  });
  if (insertErr) {
    return { error: safeDatabaseError(insertErr, "quarantine-email") };
  }

  await supabase.rpc("log_touch", {
    p_company_id: companyId.data,
    p_kanal: "email",
    p_ergebnis: "gespraech_ohne_termin",
    p_person_id: null,
    p_notiz: `Eingehende E-Mail (zugeordnet) von ${row.from_email ?? "unbekannt"}: ${row.subject ?? ""}\n\n${(row.body ?? "").slice(0, 1500)}`,
    p_naechster: null,
    p_abbruch: null,
    p_source_key: `email:${row.provider_ref}`,
  });

  await supabase
    .from("sequence_enrollments")
    .update({ status: "pausiert" })
    .eq("company_id", companyId.data)
    .eq("status", "aktiv");

  const { error: updErr } = await supabase
    .from("inbound_email_quarantine")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_company_id: companyId.data,
    })
    .eq("id", qId.data);
  if (updErr) return { error: safeDatabaseError(updErr, "resolve-quarantine") };

  revalidateCompany(companyId.data);
  revalidatePath("/einstellungen");
  return { ok: true as const };
}

export async function importCompanies(input: {
  rows: Array<{
    name: string;
    stadt?: string | null;
    telefon?: string | null;
    website?: string | null;
    email?: string | null;
    person_name?: string | null;
  }>;
  /** Optional: add all created firms to this membership list. */
  listId?: string | null;
  /** Optional: create/use a list by name (batch label), e.g. „ImmoScout Ring3“. */
  listName?: string | null;
}): Promise<
  ActionResult<{
    created: number;
    errors: string[];
    companyIds: string[];
    listId: string | null;
  }>
> {
  const rows = input.rows;
  if (!rows.length) return { error: "Keine Zeilen zum Import." };
  if (rows.length > 200) return { error: "Maximal 200 Zeilen pro Import." };

  let targetListId: string | null = null;
  if (input.listId) {
    const id = uuidSchema.safeParse(input.listId);
    if (!id.success) return { error: validationError(id.error) };
    targetListId = id.data;
  } else if (input.listName?.trim()) {
    const listRes = await upsertLeadList({ name: input.listName.trim() });
    if (!listRes.ok) return { error: listRes.error };
    targetListId = listRes.listId;
  }

  const errors: string[] = [];
  const companyIds: string[] = [];
  for (const [index, row] of rows.entries()) {
    const parsed = importCompanyRowSchema.safeParse(row);
    if (!parsed.success) {
      errors.push(`Zeile ${index + 1}: ${validationError(parsed.error)}`);
      continue;
    }
    const res = await createCompany({
      name: parsed.data.name,
      stadt: parsed.data.stadt,
      telefon: parsed.data.telefon,
      website: parsed.data.website,
      person: parsed.data.person_name
        ? {
            name: parsed.data.person_name,
            email: parsed.data.email,
            telefon: parsed.data.telefon,
          }
        : parsed.data.email
          ? {
              name: parsed.data.name,
              email: parsed.data.email,
              telefon: parsed.data.telefon,
            }
          : null,
    });
    if (res.error) errors.push(`Zeile ${index + 1}: ${res.error}`);
    else if (res.ok) companyIds.push(res.companyId);
  }

  if (targetListId && companyIds.length) {
    for (let i = 0; i < companyIds.length; i += 100) {
      const chunk = companyIds.slice(i, i + 100);
      const addRes = await addCompaniesToList({
        listId: targetListId,
        companyIds: chunk,
      });
      if (addRes.error) {
        errors.push(`Liste: ${addRes.error}`);
        break;
      }
    }
  }

  revalidatePath("/liste");
  revalidatePath("/termine");
  return {
    ok: true as const,
    created: companyIds.length,
    errors,
    companyIds,
    listId: targetListId,
  };
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
    linkedin_url?: string | null;
    stadt?: string | null;
    mitarbeiterzahl?: MitarbeiterKlasse | null;
    inserate_aktiv?: number | null;
    meta_ads?: boolean | null;
  },
): Promise<ActionResult> {
  const parsed = listFieldsSchema.safeParse({ companyId, patch });
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const p = parsed.data.patch;
  const update: {
    crm_system?: CrmSystem | null;
    anfragen_pro_woche?: number | null;
    website?: string | null;
    instagram_url?: string | null;
    facebook_url?: string | null;
    linkedin_url?: string | null;
    stadt?: string | null;
    mitarbeiterzahl?: MitarbeiterKlasse | null;
    inserate_aktiv?: number | null;
    meta_ads?: boolean | null;
  } = {};
  if ("crm_system" in p) update.crm_system = p.crm_system ?? null;
  if ("anfragen_pro_woche" in p) {
    update.anfragen_pro_woche = p.anfragen_pro_woche ?? null;
  }
  if ("website" in p) update.website = p.website ?? null;
  if ("instagram_url" in p) update.instagram_url = p.instagram_url ?? null;
  if ("facebook_url" in p) update.facebook_url = p.facebook_url ?? null;
  if ("linkedin_url" in p) update.linkedin_url = p.linkedin_url ?? null;
  if ("stadt" in p) update.stadt = p.stadt ?? null;
  if ("mitarbeiterzahl" in p) update.mitarbeiterzahl = p.mitarbeiterzahl ?? null;
  if ("inserate_aktiv" in p) update.inserate_aktiv = p.inserate_aktiv ?? null;
  if ("meta_ads" in p) update.meta_ads = p.meta_ads ?? null;
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

export async function upsertCustomFieldDef(input: {
  id?: string;
  name: string;
  slug: string;
  field_type:
    | "single_select"
    | "multi_select"
    | "text"
    | "number"
    | "url"
    | "phone";
  options?: string[];
  active?: boolean;
  sort_order?: number;
}): Promise<ActionResult<{ fieldId: string }>> {
  const parsed = customFieldDefSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  if (parsed.data.id) {
    const { error } = await supabase
      .from("custom_field_defs")
      .update({
        name: parsed.data.name,
        slug: parsed.data.slug,
        field_type: parsed.data.field_type,
        options: parsed.data.options ?? [],
        active: parsed.data.active ?? true,
        sort_order: parsed.data.sort_order ?? 0,
      })
      .eq("id", parsed.data.id);
    if (error) return { error: safeDatabaseError(error, "update-field-def") };
    revalidatePath("/einstellungen");
    revalidatePath("/liste");
    return { ok: true as const, fieldId: parsed.data.id };
  }
  const { data, error } = await supabase
    .from("custom_field_defs")
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      field_type: parsed.data.field_type,
      options: parsed.data.options ?? [],
      active: parsed.data.active ?? true,
      sort_order: parsed.data.sort_order ?? 0,
    })
    .select("id")
    .single();
  if (error) return { error: safeDatabaseError(error, "create-field-def") };
  revalidatePath("/einstellungen");
  revalidatePath("/liste");
  return { ok: true as const, fieldId: data.id };
}

export async function deactivateCustomFieldDef(
  id: string,
): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("custom_field_defs")
    .update({ active: false })
    .eq("id", parsed.data);
  if (error) return { error: safeDatabaseError(error, "deactivate-field") };
  revalidatePath("/einstellungen");
  revalidatePath("/liste");
  return { ok: true as const };
}

export async function reorderCustomFieldDefs(
  orderedIds: string[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_custom_field_defs", {
    p_ordered_ids: orderedIds,
  });
  if (error) return { error: safeDatabaseError(error, "reorder-fields") };
  revalidatePath("/einstellungen");
  return { ok: true as const };
}

export async function setCustomFieldValue(input: {
  company_id: string;
  field_id: string;
  value_text?: string | null;
  value_number?: number | null;
  value_json?: string[] | null;
}): Promise<ActionResult> {
  const parsed = customFieldValueSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("custom_field_values").upsert(
    {
      company_id: parsed.data.company_id,
      field_id: parsed.data.field_id,
      value_text: parsed.data.value_text ?? null,
      value_number: parsed.data.value_number ?? null,
      value_json: parsed.data.value_json ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,field_id" },
  );
  if (error) return { error: safeDatabaseError(error, "set-field-value") };
  revalidateCompany(parsed.data.company_id);
  return { ok: true as const };
}

export async function summarizeLead(
  companyId: string,
): Promise<ActionResult<{ summary: string }>> {
  const parsed = uuidSchema.safeParse(companyId);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return {
      error:
        "KI-Briefing nicht konfiguriert (ANTHROPIC_API_KEY fehlt). Recherche und Timeline bleiben verfügbar.",
    };
  }

  const supabase = await createClient();
  const [{ data: company }, { data: people }, { data: touches }] =
    await Promise.all([
      supabase
        .from("companies")
        .select(
          "name,stadt,telefon,website,instagram_url,facebook_url,linkedin_url,mitarbeiterzahl,crm_system,anfragen_pro_woche,inserate_aktiv,meta_ads,recherche,pipeline_status",
        )
        .eq("id", parsed.data)
        .maybeSingle(),
      supabase
        .from("people")
        .select("name,rolle,email,telefon,ist_entscheider")
        .eq("company_id", parsed.data),
      supabase
        .from("touchpoints")
        .select("kanal,ergebnis,notiz,occurred_at,naechster_touch")
        .eq("company_id", parsed.data)
        .is("voided_at", null)
        .order("occurred_at", { ascending: false })
        .limit(30),
    ]);
  if (!company) return { error: "Firma nicht gefunden." };

  const payload = {
    firma: company,
    personen: people ?? [],
    history: touches ?? [],
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: `Du bist ein Sales-Assistent für B2B-Akquise (Hausverwaltung / Immobilien). Fasse auf Deutsch in 5–8 kurzen Bulletpoints zusammen, was wir über diesen Lead wissen. Nur Fakten aus den Daten, keine Erfindung.\n\n${JSON.stringify(payload)}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      return { error: `KI-Anfrage fehlgeschlagen (${res.status}).` };
    }
    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = body.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    if (!text) return { error: "Leere KI-Antwort." };
    return { ok: true as const, summary: text };
  } catch {
    return { error: "KI-Briefing konnte nicht geladen werden." };
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
