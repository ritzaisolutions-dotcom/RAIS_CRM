"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatDateDe } from "@/lib/sales/leads";
import { safeDatabaseError, validationError } from "@/lib/sales/validation";
import {
  LEAD_QUELLEN,
  type ImportLeadResult,
  type LeadQuelle,
} from "@/lib/sales/types";

type ActionResult<T extends object = Record<never, never>> =
  | ({ ok: true; error?: never } & T)
  | ({ error: string; ok?: never } & { [Key in keyof T]?: never });

function revalidateLead(companyId?: string) {
  revalidatePath("/leads");
  revalidatePath("/wiedervorlagen");
  if (companyId) revalidatePath(`/firma/${companyId}`);
}

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum");
const quelleSchema = z.enum(LEAD_QUELLEN);
const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/**
 * URL wie in `validation.ts`: fehlendes Schema → https://, nur HTTP(S) erlaubt
 * (blockt `javascript:` & Co.). Leer → null.
 */
const optUrl = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null;
    return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  })
  .refine((v) => v === null || /^https?:\/\//i.test(v), "Nur HTTP(S)-URLs sind erlaubt");

/** Wiedervorlage setzen: Notiz-Touch über `log_touch` (append-only). */
export async function setWiedervorlage(input: {
  companyId: string;
  date: string;
  personId?: string | null;
}): Promise<ActionResult> {
  const parsed = z
    .object({ companyId: uuid, date: ymd, personId: uuid.nullable().optional() })
    .safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("log_touch", {
    p_company_id: parsed.data.companyId,
    p_kanal: "note",
    p_ergebnis: "kein_ergebnis",
    p_person_id: parsed.data.personId ?? null,
    p_notiz: `Wiedervorlage → ${formatDateDe(parsed.data.date)}`,
    p_naechster: parsed.data.date,
    p_abbruch: null,
  });
  if (error) return { error: safeDatabaseError(error, "set-wiedervorlage") };
  revalidateLead(parsed.data.companyId);
  return { ok: true as const };
}

export async function setLeadQuelle(input: {
  companyId: string;
  quelle: LeadQuelle | null;
  quellUrl?: string | null;
}): Promise<ActionResult> {
  const parsed = z
    .object({
      companyId: uuid,
      quelle: quelleSchema.nullable(),
      quellUrl: optText(2000),
    })
    .safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const patch: { quelle: LeadQuelle | null; quell_url?: string | null } = {
    quelle: parsed.data.quelle,
  };
  if (input.quellUrl !== undefined) patch.quell_url = parsed.data.quellUrl;
  const { data, error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", parsed.data.companyId)
    .select("id")
    .maybeSingle();
  if (error) return { error: safeDatabaseError(error, "set-quelle") };
  if (!data) return { error: "Lead nicht gefunden oder keine Berechtigung." };
  revalidateLead(parsed.data.companyId);
  return { ok: true as const };
}

const createLeadSchema = z.object({
  name: z.string().trim().min(1, "Firma ist Pflicht").max(200),
  stadt: optText(120),
  telefon: optText(60),
  website: optUrl,
  linkedin_url: optUrl,
  instagram_url: optUrl,
  facebook_url: optUrl,
  quelle: quelleSchema.default("manuell"),
  person_name: optText(160),
  person_email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().email().safeParse(v).success, {
      message: "Ungültige E-Mail-Adresse",
    }),
  person_telefon: optText(60),
});

export async function createLead(
  input: z.input<typeof createLeadSchema>,
): Promise<ActionResult<{ companyId: string }>> {
  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const d = parsed.data;
  // Ohne Namen, aber mit E-Mail: Firma als Kontaktname, damit die Adresse nicht verloren geht.
  const personName =
    d.person_name ?? (d.person_email || d.person_telefon ? d.name : null);

  const supabase = await createClient();
  const { data: companyId, error } = await supabase.rpc("create_company", {
    p_name: d.name,
    p_stadt: d.stadt,
    p_telefon: d.telefon,
    p_website: d.website,
    p_instagram_url: d.instagram_url,
    p_facebook_url: d.facebook_url,
    p_pipeline_status: "neu",
    p_person_name: personName,
    p_person_email: d.person_email,
    p_person_telefon: d.person_telefon,
    p_quelle: d.quelle,
    p_linkedin_url: d.linkedin_url,
  });
  if (error) return { error: safeDatabaseError(error, "create-lead") };
  if (!companyId) return { error: "Lead konnte nicht angelegt werden." };
  revalidateLead();
  return { ok: true as const, companyId };
}

const importRowSchema = z.object({
  name: z.string().trim().max(200),
  stadt: optText(120),
  telefon: optText(60),
  website: optUrl,
  email: optText(320),
  person_name: optText(160),
  rolle: optText(120),
  person_telefon: optText(60),
  linkedin_url: optUrl,
  instagram_url: optUrl,
  facebook_url: optUrl,
  quelle: optText(80),
  notiz: optText(4000),
});

export type ImportLeadRow = z.input<typeof importRowSchema>;

/** Ein Block (≤ 200 Zeilen) an `sales.import_leads`. Der Client ruft blockweise auf. */
export async function importLeadsChunk(input: {
  rows: ImportLeadRow[];
  listId?: string | null;
  defaultQuelle?: LeadQuelle;
}): Promise<ActionResult<{ results: ImportLeadResult[] }>> {
  const parsed = z
    .object({
      rows: z.array(importRowSchema).min(1).max(200),
      listId: uuid.nullable().optional(),
      defaultQuelle: quelleSchema.optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_leads", {
    p_rows: parsed.data.rows,
    p_skip_duplicates: true,
    p_list_id: parsed.data.listId ?? null,
    p_default_quelle: parsed.data.defaultQuelle ?? "manuell",
  });
  if (error) return { error: safeDatabaseError(error, "import-leads") };
  revalidateLead();
  return { ok: true as const, results: (data ?? []) as ImportLeadResult[] };
}

/** Persona-Kontext: Freitext, wie der Ansprechpartner tickt. */
export async function setLeadPersona(input: {
  companyId: string;
  persona: string | null;
}): Promise<ActionResult> {
  const parsed = z
    .object({ companyId: uuid, persona: optText(8000) })
    .safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ persona: parsed.data.persona })
    .eq("id", parsed.data.companyId)
    .select("id")
    .maybeSingle();
  if (error) return { error: safeDatabaseError(error, "set-persona") };
  if (!data) return { error: "Lead nicht gefunden oder keine Berechtigung." };
  revalidateLead(parsed.data.companyId);
  return { ok: true as const };
}

/** Anzahl echter Kontakte (siehe `sales.contact_attempts`). */
export async function countContactAttempts(companyId: string): Promise<number> {
  const parsed = uuid.safeParse(companyId);
  if (!parsed.success) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("touchpoints")
    .select("id", { count: "exact", head: true })
    .eq("company_id", parsed.data)
    .is("voided_at", null)
    .in("kanal", ["call", "email", "dm", "sms", "meeting"]);
  if (error) return 0;
  return count ?? 0;
}

/** Kategorie setzen: Lead (Zielgruppe) oder Kontakt (Netzwerk). */
export async function setLeadKategorie(input: {
  companyId: string;
  kategorie: "lead" | "kontakt";
}): Promise<ActionResult> {
  const parsed = z
    .object({ companyId: uuid, kategorie: z.enum(["lead", "kontakt"]) })
    .safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ kategorie: parsed.data.kategorie })
    .eq("id", parsed.data.companyId)
    .select("id")
    .maybeSingle();
  if (error) return { error: safeDatabaseError(error, "set-kategorie") };
  if (!data) return { error: "Lead nicht gefunden oder keine Berechtigung." };
  revalidateLead(parsed.data.companyId);
  return { ok: true as const };
}
