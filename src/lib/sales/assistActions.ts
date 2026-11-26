"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { asanaConfigured, createAsanaTask } from "@/lib/integrations/asana";
import { publicBaseUrl } from "@/lib/publicUrl";
import { validationError } from "@/lib/sales/validation";
import { PIPELINE_STATUS_LABELS, type PipelineStatus } from "@/lib/sales/types";

type Result<T extends object = Record<never, never>> =
  | ({ ok: true; error?: never } & T)
  | ({ error: string; ok?: never } & { [K in keyof T]?: never });

const uuid = z.string().uuid();

/* ------------------------------------------------------------------ */
/* Lead-Kontext (für Asana-Notiz und KI-Entwurf)                       */
/* ------------------------------------------------------------------ */

async function loadLeadContext(companyId: string) {
  const supabase = await createClient();
  const [{ data: company }, { data: people }, { data: touches }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id,name,stadt,website,telefon,pipeline_status,relationship,recherche,persona,quelle,crm_system,mitarbeiterzahl,inserate_aktiv",
      )
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("people")
      .select("id,name,rolle,email,telefon,ist_entscheider")
      .eq("company_id", companyId)
      .order("ist_entscheider", { ascending: false }),
    supabase
      .from("touchpoints")
      .select("kanal,ergebnis,notiz,occurred_at")
      .eq("company_id", companyId)
      .is("voided_at", null)
      .order("occurred_at", { ascending: false })
      .limit(25),
  ]);
  return { company, people: people ?? [], touches: touches ?? [] };
}

const stamp = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
  timeStyle: "short",
});

/* ------------------------------------------------------------------ */
/* Asana                                                               */
/* ------------------------------------------------------------------ */

export async function getAsanaStatus(): Promise<{ configured: boolean }> {
  return { configured: asanaConfigured() };
}

/**
 * Asana-Aufgabe zum Lead: Titel frei, Notiz mit Lead-Daten + CRM-Link.
 * Wird im CRM als Aufgaben-Touch mit Link protokolliert.
 */
export async function createAsanaTaskForLead(input: {
  companyId: string;
  title: string;
  dueOn?: string | null;
  dueAt?: string | null;
  note?: string | null;
}): Promise<Result<{ url: string | null }>> {
  const parsed = z
    .object({
      companyId: uuid,
      title: z.string().trim().min(1, "Titel fehlt").max(250),
      dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      dueAt: z.string().datetime({ offset: true }).nullable().optional(),
      note: z.string().max(4000).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const { company, people } = await loadLeadContext(parsed.data.companyId);
  if (!company) return { error: "Lead nicht gefunden." };
  const main = people[0];
  const base = await publicBaseUrl();

  const notes = [
    parsed.data.note?.trim() || null,
    "",
    `Lead: ${company.name}${company.stadt ? ` (${company.stadt})` : ""}`,
    main ? `Kontakt: ${main.name}${main.rolle ? `, ${main.rolle}` : ""}` : null,
    main?.telefon || company.telefon ? `Telefon: ${main?.telefon || company.telefon}` : null,
    main?.email ? `E-Mail: ${main.email}` : null,
    `Status: ${PIPELINE_STATUS_LABELS[company.pipeline_status as PipelineStatus] ?? company.pipeline_status}`,
    company.persona ? `\nPersona:\n${company.persona}` : null,
    `\nIm CRM: ${base}/firma/${company.id}`,
  ]
    .filter((l) => l !== null)
    .join("\n")
    .trim();

  const res = await createAsanaTask({
    name: parsed.data.title,
    notes,
    dueOn: parsed.data.dueOn ?? null,
    dueAt: parsed.data.dueAt ?? null,
  });
  if ("error" in res) return { error: res.error! };

  // Nachvollziehbar im Lead: Aufgaben-Touch mit Link (append-only).
  await supabase.rpc("log_touch", {
    p_company_id: company.id,
    p_kanal: "task",
    p_ergebnis: "kein_ergebnis",
    p_person_id: main?.id ?? null,
    p_notiz: `Asana-Aufgabe: ${parsed.data.title}${res.url ? `\n${res.url}` : ""}`,
    p_naechster: null,
    p_abbruch: null,
  });
  revalidatePath(`/firma/${company.id}`);
  return { ok: true as const, url: res.url };
}

/* ------------------------------------------------------------------ */
/* KI-Entwurf für E-Mails                                              */
/* ------------------------------------------------------------------ */

const DRAFT_MODEL = "claude-sonnet-5-5";

/**
 * Schreibt (oder überarbeitet) eine E-Mail auf Basis des ganzen Lead-Kontexts:
 * Persona, Notizen, Recherche, Verlauf, Status. Variablen wie {{vorname}}
 * oder {{terminvorschlaege}} bleiben erhalten bzw. werden genutzt.
 */
export async function draftEmailWithAI(input: {
  companyId: string;
  personId?: string | null;
  instruction: string;
  currentSubject?: string;
  currentBody?: string;
  withSlots?: boolean;
  senderName?: string | null;
  /** Zusätzliche Pflicht-Platzhalter, z. B. für die Termin-Einladung. */
  requiredPlaceholders?: ("termin" | "meetlink")[];
  /** Zusätzlicher Kontext für den Auftrag (z. B. Termin, Dauer). */
  extraContext?: string;
}): Promise<Result<{ subject: string; body: string }>> {
  const parsed = z
    .object({
      companyId: uuid,
      personId: uuid.nullable().optional(),
      instruction: z.string().trim().max(2000),
      currentSubject: z.string().max(400).optional(),
      currentBody: z.string().max(10000).optional(),
      withSlots: z.boolean().optional(),
      senderName: z.string().max(120).nullable().optional(),
      requiredPlaceholders: z.array(z.enum(["termin", "meetlink"])).max(2).optional(),
      extraContext: z.string().max(1000).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { error: "KI ist nicht eingerichtet (ANTHROPIC_API_KEY fehlt in den Umgebungsvariablen)." };
  }

  const { company, people, touches } = await loadLeadContext(parsed.data.companyId);
  if (!company) return { error: "Lead nicht gefunden." };
  const recipient =
    people.find((p) => p.id === parsed.data.personId) ?? people.find((p) => p.ist_entscheider) ?? people[0] ?? null;

  const history = touches
    .filter((t) => t.notiz?.trim())
    .map((t) => `- ${stamp.format(new Date(t.occurred_at))} [${t.kanal}${t.ergebnis !== "kein_ergebnis" ? `, ${t.ergebnis}` : ""}] ${t.notiz!.trim().slice(0, 600)}`)
    .join("\n");

  const context = [
    `Firma: ${company.name}${company.stadt ? `, ${company.stadt}` : ""}`,
    company.website ? `Website: ${company.website}` : null,
    `Status im Vertrieb: ${PIPELINE_STATUS_LABELS[company.pipeline_status as PipelineStatus] ?? company.pipeline_status}`,
    company.quelle ? `Lead-Quelle: ${company.quelle}` : null,
    company.crm_system ? `Maklersoftware: ${company.crm_system}` : null,
    company.mitarbeiterzahl ? `Mitarbeiter: ${company.mitarbeiterzahl}` : null,
    company.inserate_aktiv != null ? `Aktive Inserate: ${company.inserate_aktiv}` : null,
    recipient
      ? `Empfänger: ${recipient.name}${recipient.rolle ? ` (${recipient.rolle})` : ""}`
      : "Empfänger: unbekannt (allgemeine Anrede)",
    company.persona ? `\nPersona (wie der Kontakt tickt):\n${company.persona}` : null,
    company.recherche ? `\nRecherche:\n${company.recherche.slice(0, 2500)}` : null,
    history ? `\nVerlauf (neueste zuerst):\n${history}` : "\nVerlauf: noch kein Kontakt.",
  ]
    .filter(Boolean)
    .join("\n");

  const current =
    parsed.data.currentSubject?.trim() || parsed.data.currentBody?.trim()
      ? `\n\nAktueller Entwurf (überarbeiten statt neu schreiben, wenn sinnvoll):\nBetreff: ${parsed.data.currentSubject ?? ""}\n${parsed.data.currentBody ?? ""}`
      : "";

  const system = `Du schreibst E-Mails für Kevin Ritz von RAIS (Ritz AI Solutions). RAIS hilft Immobilienmaklern, eingehende Anfragen schneller zu erfassen und vorzuqualifizieren, damit sie nur noch die Gespräche führen, die sich lohnen.

Regeln:
- Deutsch, Sie-Form, klar und konkret, ohne Floskeln, ohne Hype, ohne „KI“-Buzzwords.
- Kurz: 60–140 Wörter, kurze Absätze. Eine klare nächste Aktion am Ende.
- Nutze nur Fakten aus dem Kontext. Erfinde keine Zahlen, Ergebnisse, Kunden oder Gesprächsinhalte.
- Beziehe dich, wo vorhanden, auf das letzte Gespräch oder die Notizen.
- Anrede: „Hallo {{vorname|zusammen}},“ wenn ein Vorname wahrscheinlich ist, sonst „Guten Tag,“. Signatur: „Viele Grüße\\n{{absender}}“.
- Erlaubte Platzhalter: {{vorname}}, {{nachname}}, {{name}}, {{firma}}, {{stadt}}, {{website}}, {{absender}}${parsed.data.withSlots ? ", {{terminvorschlaege}} (MUSS genau einmal als eigene Zeile vorkommen; dort stehen die Terminlinks)" : ""}. Keine anderen geschweiften Klammern.
${(parsed.data.requiredPlaceholders ?? [])
  .map(
    (p) =>
      `- {{${p}}} MUSS im Text vorkommen (${p === "termin" ? "Datum und Uhrzeit des Termins" : "Google-Meet-Link, als eigene Zeile"}).`,
  )
  .join("\n")}
- Antworte ausschließlich als JSON: {"subject": "...", "body": "..."}`;

  const user = `Kontext zum Lead:\n${context}${parsed.data.extraContext ? `\n\n${parsed.data.extraContext}` : ""}${current}\n\nAuftrag: ${parsed.data.instruction || "Schreibe die passende nächste E-Mail für diesen Lead."}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DRAFT_MODEL,
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: user }],
      }),
      cache: "no-store",
    });
    if (!res.ok) return { error: `KI-Anfrage fehlgeschlagen (${res.status}).` };
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (body.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    const jsonText = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const out = z
      .object({ subject: z.string().min(1).max(300), body: z.string().min(1).max(8000) })
      .safeParse(JSON.parse(jsonText));
    if (!out.success) return { error: "Die KI-Antwort war unvollständig. Bitte nochmal versuchen." };
    let draftBody = out.data.body.trim();
    if (parsed.data.withSlots && !draftBody.includes("{{terminvorschlaege}}")) {
      draftBody = draftBody.replace(/(\n\s*Viele Grüße[\s\S]*)$/, "\n\n{{terminvorschlaege}}$1");
      if (!draftBody.includes("{{terminvorschlaege}}")) draftBody += "\n\n{{terminvorschlaege}}";
    }
    for (const p of parsed.data.requiredPlaceholders ?? []) {
      const token = `{{${p}}}`;
      if (draftBody.includes(token)) continue;
      const i = draftBody.lastIndexOf("Viele Grüße");
      draftBody =
        i > 0
          ? `${draftBody.slice(0, i).trimEnd()}\n\n${token}\n\n${draftBody.slice(i)}`
          : `${draftBody}\n\n${token}`;
    }
    return { ok: true as const, subject: out.data.subject.trim(), body: draftBody };
  } catch {
    return { error: "KI-Entwurf konnte nicht erstellt werden." };
  }
}
