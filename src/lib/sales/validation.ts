import { randomUUID } from "node:crypto";
import { z } from "zod";

const nullableText = (max: number) =>
  z.string().trim().max(max).nullable().optional();
/**
 * URL-Feld, das auch nackte Domains akzeptiert.
 *
 * Die Anzeige normalisiert `firma.de` längst zu `https://firma.de`
 * (`hrefWebsite` in der Liste) — die Validierung hat dieselbe Eingabe aber mit
 * "Ungültige URL" abgelehnt. Jetzt wird `https://` ergänzt, bevor geprüft wird;
 * gespeichert wird die normalisierte Form. Andere Schemata (`javascript:`,
 * `data:`, `ftp:`) bleiben abgelehnt.
 */
const nullableUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value) => {
    if (!value) return value;
    // Ein vorhandenes Schema bleibt unangetastet, damit `javascript:` weiterhin
    // in die Ablehnung unten läuft statt zu `https://javascript:…` zu werden.
    return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  })
  .refine(
    (value) => !value || /^https?:\/\//i.test(value),
    "Nur HTTP(S)-URLs sind erlaubt",
  )
  .refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return Boolean(parsed.hostname) && parsed.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Ungültige URL")
  .nullable()
  .optional();
const nullableEmail = z
  .string()
  .trim()
  .max(254)
  .email("Ungültige E-Mail-Adresse")
  .nullable()
  .optional();
const nullablePhone = z
  .string()
  .trim()
  .max(50)
  .regex(/^[+\d\s()./-]*$/, "Ungültige Telefonnummer")
  .nullable()
  .optional();

export const uuidSchema = z.string().uuid("Ungültige ID");
export const relationshipSchema = z.enum([
  "Prospect",
  "Kunde",
  "Ausgeschlossen",
]);
export const employeeClassSchema = z.enum([
  "1-2",
  "3-5",
  "5-25",
  "25+",
  "unbekannt",
]);
export const crmSystemSchema = z.enum([
  "onOffice",
  "Propstack",
  "FlowFact",
  "FIO Webmakler",
  "kein CRM",
  "unbekannt",
]);
export const pipelineStatusSchema = z.enum([
  "neu",
  "kein_anschluss_1",
  "kein_anschluss_2",
  "kein_anschluss_3",
  "kein_anschluss_4",
  "kein_anschluss_5",
  "callback",
  "disqualified",
  "set_appointment",
  "closed",
  "kunde",
]);
export const touchChannelSchema = z.enum([
  "call",
  "dm",
  "email",
  "meeting",
  "engagement",
  "status_change",
  "sms",
  "note",
  "task",
]);
export const outreachChannelSchema = z.enum(["call", "dm", "status_change"]);
export const touchResultSchema = z.enum([
  "nicht_erreicht",
  "erreicht_ohne_gespraech",
  "disqualifiziert",
  "gespraech_ohne_termin",
  "termin_gebucht",
  "kein_ergebnis",
]);
export const cancellationReasonSchema = z.enum([
  "zu_klein",
  "kein_schmerz",
  "kein_budget",
  "kein_interesse",
  "timing",
]);
export const opportunityVariantSchema = z.enum(["system_3k", "system_crm_6k"]);
export const opportunityStageSchema = z.enum([
  "offen",
  "angebot_raus",
  "gewonnen",
  "verloren",
]);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: "Ungültiges Datum",
  });
export const nullableDateSchema = dateSchema.nullable().optional();

/**
 * `relationship` fehlt hier bewusst.
 *
 * Es wird ausschliesslich von `sales.set_pipeline_status` abgeleitet und ist
 * clientseitig nicht mehr beschreibbar. Vorher liessen sich beide Felder
 * unabhängig setzen — eine Firma konnte als `Kunde` geführt werden und
 * gleichzeitig auf `kein_anschluss_3` stehen.
 */
export const companyQualificationSchema = z.object({
  companyId: uuidSchema,
  patch: z.object({
    mitarbeiterzahl: employeeClassSchema.nullable(),
    crm_system: crmSystemSchema.nullable(),
    anfragen_pro_woche: z.number().int().min(0).max(100000).nullable(),
  }),
});

export const voidTouchSchema = z.object({
  touchId: z.number().int().positive(),
  companyId: uuidSchema,
  grund: nullableText(500),
});

export const companyBasicsSchema = z.object({
  companyId: uuidSchema,
  patch: z.object({
    name: z.string().trim().min(1, "Firma-Name ist Pflicht").max(200),
    stadt: nullableText(120),
    telefon: nullablePhone,
    website: nullableUrl,
    instagram_url: nullableUrl,
    facebook_url: nullableUrl,
    linkedin_url: nullableUrl,
    recherche: nullableText(10000),
    inserate_aktiv: z.number().int().min(0).max(100000).nullable().optional(),
    meta_ads: z.boolean().nullable().optional(),
  }),
});

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Firma-Name ist Pflicht").max(200),
  stadt: nullableText(120),
  telefon: nullablePhone,
  website: nullableUrl,
  instagram_url: nullableUrl,
  facebook_url: nullableUrl,
  crm_system: crmSystemSchema.nullable().optional(),
  anfragen_pro_woche: z.number().int().min(0).max(100000).nullable().optional(),
  pipeline_status: pipelineStatusSchema.optional(),
  person: z
    .object({
      name: z.string().trim().min(1, "Kontakt-Name ist Pflicht").max(200),
      email: nullableEmail,
      telefon: nullablePhone,
      linkedin_url: nullableUrl,
    })
    .nullable()
    .optional(),
});

export const personSchema = z.object({
  id: uuidSchema.optional(),
  company_id: uuidSchema,
  name: z.string().trim().min(1, "Kontakt-Name ist Pflicht").max(200),
  rolle: nullableText(120),
  email: nullableEmail,
  telefon: nullablePhone,
  linkedin_url: nullableUrl,
  ist_entscheider: z.boolean(),
});

export const touchpointSchema = z
  .object({
    company_id: uuidSchema,
    person_id: uuidSchema.nullable(),
    kanal: touchChannelSchema,
    ergebnis: touchResultSchema,
    notiz: nullableText(5000),
    naechster_touch: nullableDateSchema,
    abbruchgrund: cancellationReasonSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.abbruchgrund &&
      value.ergebnis !== "gespraech_ohne_termin" &&
      value.ergebnis !== "disqualifiziert"
    ) {
      context.addIssue({
        code: "custom",
        path: ["abbruchgrund"],
        message:
          "Abbruchgrund nur bei Gespräch ohne Termin oder Disqualifiziert erlaubt",
      });
    }
  });

export const opportunitySchema = z.object({
  id: uuidSchema.optional(),
  company_id: uuidSchema,
  variante: opportunityVariantSchema,
  setup_preis: z.number().min(0).max(100000000).nullable(),
  retainer_monatlich: z.number().min(0).max(10000000).nullable(),
  stage: opportunityStageSchema,
  close_grund: nullableText(1000),
  titel: nullableText(200),
  erwarteter_umsatz: z.number().min(0).max(100000000).nullable().optional(),
});

export const taskArtSchema = z.enum(["follow_up", "email", "sonstiges"]);
export const emailTaskPresetSchema = z.enum(["info", "ueber_uns", "frei"]);

export const taskSchema = z.object({
  company_id: uuidSchema,
  person_id: uuidSchema.nullable().optional(),
  titel: z.string().trim().min(1, "Titel ist Pflicht").max(200),
  notiz: nullableText(5000),
  due_on: dateSchema,
  art: taskArtSchema.optional(),
  email_preset: emailTaskPresetSchema.nullable().optional(),
  set_naechster: z.boolean().optional(),
});

export const customFieldTypeSchema = z.enum([
  "single_select",
  "multi_select",
  "text",
  "number",
  "url",
  "phone",
]);

export const customFieldDefSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_]+$/, "Slug: nur a-z, 0-9, _"),
  field_type: customFieldTypeSchema,
  options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
});

export const customFieldValueSchema = z.object({
  company_id: uuidSchema,
  field_id: uuidSchema,
  value_text: nullableText(5000).optional(),
  value_number: z.number().nullable().optional(),
  value_json: z.array(z.string().trim().min(1).max(200)).nullable().optional(),
});

export const emailTemplateSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000),
});

export const sendEmailSchema = z.object({
  company_id: uuidSchema,
  person_id: uuidSchema.nullable().optional(),
  to_email: z.string().trim().email("Ungültige E-Mail"),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000),
  template_id: uuidSchema.nullable().optional(),
});

export const sendSmsSchema = z.object({
  company_id: uuidSchema,
  person_id: uuidSchema.nullable().optional(),
  to_phone: z
    .string()
    .trim()
    .min(5)
    .max(50)
    .regex(/^[+\d\s()./-]+$/, "Ungültige Telefonnummer"),
  body: z.string().trim().min(1).max(1000),
});

export const sequenceSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1).max(120),
  active: z.boolean().optional(),
});

export const sequenceStepSchema = z.object({
  sequence_id: uuidSchema,
  step_order: z.number().int().min(1).max(50),
  kanal: z.enum(["email", "call", "sms", "task"]),
  delay_days: z.number().int().min(0).max(365),
  subject: nullableText(300),
  body: nullableText(20000),
  task_titel: nullableText(200),
});

export const enrollSequenceSchema = z.object({
  sequence_id: uuidSchema,
  company_id: uuidSchema,
  person_id: uuidSchema.nullable().optional(),
});

export const workflowRuleSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1).max(120),
  active: z.boolean().optional(),
  trigger_pipeline_status: pipelineStatusSchema,
  task_titel: z.string().trim().min(1).max(200),
  task_due_days: z.number().int().min(0).max(90),
});

export const savedViewSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1).max(80),
  scope: z.enum(["liste", "kunden"]),
  filters: z.object({
    status: z.string().optional(),
    due: z.string().optional(),
    q: z.string().optional(),
    sort: z.string().optional(),
  }),
});

export const bulkPipelineSchema = z.object({
  companyIds: z.array(uuidSchema).min(1).max(100),
  pipelineStatus: pipelineStatusSchema,
  kanal: outreachChannelSchema.optional(),
  naechsterTouch: nullableDateSchema,
});

export const importCompanyRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  stadt: nullableText(120),
  telefon: nullablePhone,
  website: nullableUrl,
  email: nullableEmail,
  person_name: nullableText(200),
});

export const pipelineChangeSchema = z.object({
  companyId: uuidSchema,
  pipelineStatus: pipelineStatusSchema,
  kanal: outreachChannelSchema.optional(),
  naechsterTouch: nullableDateSchema,
});

export const listFieldsSchema = z.object({
  companyId: uuidSchema,
  patch: z
    .object({
      crm_system: crmSystemSchema.nullable().optional(),
      anfragen_pro_woche: z
        .number()
        .int()
        .min(0)
        .max(100000)
        .nullable()
        .optional(),
      website: nullableUrl,
      instagram_url: nullableUrl,
      facebook_url: nullableUrl,
      linkedin_url: nullableUrl,
      stadt: nullableText(120),
      mitarbeiterzahl: employeeClassSchema.nullable().optional(),
      inserate_aktiv: z
        .number()
        .int()
        .min(0)
        .max(100000)
        .nullable()
        .optional(),
      meta_ads: z.boolean().nullable().optional(),
    })
    .refine((patch) => Object.keys(patch).length > 0, "Keine Änderungen"),
});

export function validationError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Ungültige Eingabe";
}

type DatabaseError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export function safeDatabaseError(
  error: DatabaseError,
  context: string,
): string {
  switch (error.code) {
    case "23505":
      return "Dieser Datensatz existiert bereits.";
    case "23503":
      return "Die verknüpften Daten sind ungültig.";
    case "42501":
      return "Keine Berechtigung für diese Aktion.";
    case "P0002":
      return "Der Datensatz wurde nicht gefunden.";
    case "22023":
      return "Ungültige Eingabe.";
    default: {
      const reference = randomUUID().slice(0, 8);
      console.error(`[sales:${context}:${reference}]`, {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return `Die Aktion konnte nicht abgeschlossen werden. Referenz: ${reference}`;
    }
  }
}
