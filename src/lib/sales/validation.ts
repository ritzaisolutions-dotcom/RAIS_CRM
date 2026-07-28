import { randomUUID } from "node:crypto";
import { z } from "zod";

const nullableText = (max: number) =>
  z.string().trim().max(max).nullable().optional();
const nullableUrl = z
  .string()
  .trim()
  .max(2048)
  .url("Ungültige URL")
  .refine((value) => /^https?:\/\//i.test(value), "Nur HTTP(S)-URLs sind erlaubt")
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

export const companyQualificationSchema = z.object({
  companyId: uuidSchema,
  patch: z.object({
    mitarbeiterzahl: employeeClassSchema.nullable(),
    crm_system: crmSystemSchema.nullable(),
    anfragen_pro_woche: z.number().int().min(0).max(100000).nullable(),
    relationship: relationshipSchema,
  }),
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
