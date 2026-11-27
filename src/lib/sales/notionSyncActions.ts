"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  NotionError,
  fetchLeadPages,
  fetchPageBlocks,
  notionConfigured,
} from "@/lib/integrations/notion";
import { businessToday } from "@/lib/sales/dates";
import {
  SKIP_LABELS,
  blocksToText,
  mapNotionPage,
  mapRecord,
  planSync,
  type CompanyPatch,
  type ExistingCompany,
  type NotionLead,
  type NotionPage,
  type SkipReason,
  type SourceRecord,
  type SyncPlan,
} from "@/lib/sales/notionSync";
import { safeDatabaseError } from "@/lib/sales/validation";
import type { ImportLeadResult } from "@/lib/sales/types";

/**
 * Notion → CRM. Zwei Quellen, ein Abgleich:
 * - „api“: liest die Datenbank direkt (braucht NOTION_TOKEN)
 * - „export“: Zeilen aus einem hochgeladenen Notion-Export (im Browser entpackt)
 * Vorschau liest nur. „Übernehmen“ rechnet den Plan serverseitig neu und schreibt.
 */

const SETTINGS_KEY = "notion_leads_sync";
/** Erster Sync: alles bis zum manuellen Import vom 26.11. gilt als übernommen. */
const BASELINE = "2026-11-26T18:00:00.000Z";

export type NotionSyncState = {
  apiConfigured: boolean;
  lastSync: string | null;
  lastSource: "api" | "export" | null;
  lastCounts: SyncCounts | null;
};
export type SyncCounts = { create: number; update: number; conflicts: number; skipped: number };

export type NotionSyncPreview = {
  ok: true;
  pages: number;
  counts: SyncCounts;
  create: { firma: string; stadt: string | null; notionStatus: string; status: string }[];
  update: { firma: string; fields: string[]; status: string | null; note: boolean; matchedBy: string }[];
  conflicts: SyncPlan["conflicts"];
  skipped: { reason: string; count: number }[];
};

export type NotionSyncResult = {
  ok: true;
  created: number;
  duplicates: number;
  updated: number;
  notes: number;
  statuses: number;
  errors: string[];
};

type Result<T> = T | { error: string };

const recordSchema = z.object({
  pageId: z.string().min(1).max(80),
  lastEdited: z.string().max(40),
  fields: z.record(z.string().max(60), z.string().max(20000).nullable()),
  body: z.string().max(20000).optional(),
});
const recordsSchema = z.array(recordSchema).min(1).max(3000);

type Source = { kind: "api" } | { kind: "export"; records: SourceRecord[] };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

type Supabase = NonNullable<Awaited<ReturnType<typeof requireUser>>>;

async function readState(supabase: Supabase) {
  const { data } = await supabase.from("app_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  const v = (data?.value ?? {}) as { at?: string; source?: "api" | "export"; counts?: SyncCounts };
  return { at: v.at ?? null, source: v.source ?? null, counts: v.counts ?? null };
}

export async function getNotionSyncState(): Promise<NotionSyncState> {
  const supabase = await requireUser();
  if (!supabase) return { apiConfigured: false, lastSync: null, lastSource: null, lastCounts: null };
  const s = await readState(supabase);
  return { apiConfigured: notionConfigured(), lastSync: s.at, lastSource: s.source, lastCounts: s.counts };
}

async function loadCompanies(supabase: Supabase): Promise<ExistingCompany[]> {
  const [{ data, error }, { data: people, error: pErr }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id,name,stadt,quell_url,pipeline_status,telefon,website,instagram_url,crm_system,inserate_aktiv,meta_ads,notion_id,icp",
      )
      .range(0, 9999),
    supabase.from("people").select("company_id,name,email,telefon").range(0, 19999),
  ]);
  if (error) throw error;
  if (pErr) throw pErr;
  const byCompany = new Map<string, NonNullable<ExistingCompany["people"]>>();
  for (const p of (people ?? []) as { company_id: string; name: string; email: string | null; telefon: string | null }[]) {
    byCompany.set(p.company_id, [...(byCompany.get(p.company_id) ?? []), p]);
  }
  return ((data ?? []) as ExistingCompany[]).map((c) => ({ ...c, people: byCompany.get(c.id) ?? [] }));
}

function errorMessage(e: unknown): string {
  if (e instanceof NotionError) {
    if (e.status === 401) return "Notion-Token ungültig. Bitte NOTION_TOKEN prüfen.";
    if (e.status === 404)
      return "Datenbank nicht gefunden. Ist sie mit der Notion-Integration geteilt (⋯ → Verbindungen)?";
    return `Notion-Fehler: ${e.message}`;
  }
  return "Abgleich fehlgeschlagen.";
}

async function resolveSource(
  supabase: Supabase | null,
  source: Source,
): Promise<{ supabase: Supabase; source: Source } | { error: string }> {
  if (!supabase) return { error: "Nicht angemeldet." };
  if (source.kind === "api" && !notionConfigured()) {
    return { error: "Notion ist nicht verbunden (NOTION_TOKEN fehlt)." };
  }
  if (source.kind === "export") {
    const parsed = recordsSchema.safeParse(source.records);
    if (!parsed.success) return { error: "Export konnte nicht gelesen werden (ungültige Zeilen)." };
    return { supabase, source: { kind: "export", records: parsed.data } };
  }
  return { supabase, source };
}

async function buildPlan(supabase: Supabase, source: Source) {
  const today = businessToday();
  const [companies, state] = await Promise.all([loadCompanies(supabase), readState(supabase)]);
  let leads: NotionLead[];
  let pages: NotionPage[] = [];
  if (source.kind === "api") {
    pages = await fetchLeadPages();
    leads = pages.map((p) => mapNotionPage(p, "", today));
  } else {
    leads = source.records.map((r) => mapRecord(r, today));
  }
  const plan = planSync(leads, companies, { lastSync: state.at ?? BASELINE, today });
  return { pages, leads, plan, today };
}

function counts(plan: SyncPlan): SyncCounts {
  return {
    create: plan.create.length,
    update: plan.update.length,
    conflicts: plan.conflicts.length,
    skipped: plan.skipped.length,
  };
}

const FIELD_LABELS: Record<string, string> = {
  telefon: "Telefon",
  website: "Website",
  stadt: "Stadt",
  instagram_url: "Instagram",
  quell_url: "IS24-Link",
  crm_system: "CRM",
  inserate_aktiv: "Inserate",
  meta_ads: "Meta Ads",
  notion_id: "Notion-Verknüpfung",
  icp: "ICP",
};

async function preview(source: Source): Promise<Result<NotionSyncPreview>> {
  const resolved = await resolveSource(await requireUser(), source);
  if ("error" in resolved) return resolved;
  let built;
  try {
    built = await buildPlan(resolved.supabase, resolved.source);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  const { leads, plan } = built;
  const skipped = Object.entries(
    plan.skipped.reduce<Record<string, number>>((m, s) => ((m[s.reason] = (m[s.reason] ?? 0) + 1), m), {}),
  ).map(([reason, count]) => ({ reason: SKIP_LABELS[reason as SkipReason], count }));
  return {
    ok: true,
    pages: leads.length,
    counts: counts(plan),
    create: plan.create.map((c) => ({
      firma: c.lead.firma ?? "",
      stadt: c.lead.stadt,
      notionStatus: c.lead.notionStatus,
      status: c.lead.status,
    })),
    update: plan.update.map((u) => ({
      firma: u.companyName,
      fields: Object.keys(u.patch).map((k) => FIELD_LABELS[k] ?? k),
      status: u.setStatus?.status ?? null,
      note: Boolean(u.note),
      matchedBy: u.matchedBy,
    })),
    conflicts: plan.conflicts,
    skipped,
  };
}

export async function previewNotionSync(): Promise<Result<NotionSyncPreview>> {
  return preview({ kind: "api" });
}

export async function previewNotionExport(records: SourceRecord[]): Promise<Result<NotionSyncPreview>> {
  return preview({ kind: "export", records });
}

/** Seiteninhalt neuer Leads über die API (begrenzt, 3 parallel wegen Rate-Limit). */
async function fetchBodies(pageIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const queue = pageIds.slice(0, 60);
  async function worker() {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        out.set(id, blocksToText(await fetchPageBlocks(id)));
      } catch {
        /* Seiteninhalt ist optional */
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return out;
}

async function apply(source: Source): Promise<Result<NotionSyncResult>> {
  const resolved = await resolveSource(await requireUser(), source);
  if ("error" in resolved) return resolved;
  const { supabase } = resolved;

  let built;
  try {
    built = await buildPlan(supabase, resolved.source);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  const { pages, leads, plan, today } = built;
  // Stand der Daten: beim Export die jüngste Bearbeitung darin (nicht der Upload-Zeitpunkt),
  // sonst gingen Notion-Änderungen zwischen Export und Upload beim nächsten Mal verloren.
  const startedAt =
    resolved.source.kind === "export"
      ? leads.reduce((max, l) => (l.lastEdited > max ? l.lastEdited : max), BASELINE)
      : new Date().toISOString();
  const errors: string[] = [];
  const result: NotionSyncResult = { ok: true, created: 0, duplicates: 0, updated: 0, notes: 0, statuses: 0, errors };

  // 1) Neue Leads. Bei der API-Quelle den Seiteninhalt nachladen (der Export bringt ihn mit).
  let creates = plan.create;
  if (resolved.source.kind === "api") {
    const pageById = new Map<string, NotionPage>(pages.map((p) => [p.id, p]));
    const bodies = await fetchBodies(plan.create.map((c) => c.lead.pageId));
    creates = plan.create.map((c) => {
      const body = bodies.get(c.lead.pageId);
      const page = pageById.get(c.lead.pageId);
      return body && page ? { ...c, lead: mapNotionPage(page, body, today) } : c;
    });
  }

  for (let i = 0; i < creates.length; i += 50) {
    const chunk = creates.slice(i, i + 50);
    const rows = chunk.map(({ lead }) => ({
      name: lead.firma,
      stadt: lead.stadt,
      telefon: lead.telefon,
      website: lead.website,
      instagram_url: lead.instagram,
      quell_url: lead.is24,
      person_name: lead.person.name,
      rolle: lead.person.rolle,
      email: lead.person.email,
      quelle: "IS24",
      notiz: lead.notiz,
    }));
    const { data, error } = await supabase.rpc("import_leads", {
      p_rows: rows,
      p_skip_duplicates: true,
      p_default_quelle: "IS24",
    });
    if (error) {
      errors.push(safeDatabaseError(error, "notion-sync-import"));
      continue;
    }
    for (const r of (data ?? []) as ImportLeadResult[]) {
      const item = chunk[r.index];
      if (!item) continue;
      if (r.status === "duplicate") {
        result.duplicates++;
        continue;
      }
      if (r.status !== "created" || !r.company_id) {
        errors.push(`${item.lead.firma}: ${r.message ?? "Fehler"}`);
        continue;
      }
      result.created++;
      const { lead, wv } = item;
      const qual: CompanyPatch = { notion_id: lead.pageId, icp: lead.icp };
      if (lead.crm) qual.crm_system = lead.crm;
      if (lead.inserate !== null && Number.isFinite(lead.inserate)) qual.inserate_aktiv = lead.inserate;
      if (lead.meta !== null) qual.meta_ads = lead.meta;
      await supabase.from("companies").update(qual).eq("id", r.company_id);
      if (lead.status !== "neu") {
        const { error: e } = await supabase.rpc("set_pipeline_status", {
          p_company_id: r.company_id,
          p_pipeline_status: lead.status,
          p_kanal: "status_change",
          p_naechster_touch: wv,
        });
        if (e) errors.push(`${lead.firma}: Status nicht gesetzt`);
        else result.statuses++;
      } else if (wv) {
        await supabase.rpc("log_touch", {
          p_company_id: r.company_id,
          p_kanal: "note",
          p_notiz: `Wiedervorlage → ${wv.split("-").reverse().join(".")}`,
          p_naechster: wv,
        });
      }
    }
  }

  // 2) Bestehende Leads – nur leere Felder, Notiz idempotent, Status nur bei „Neu“.
  for (const u of plan.update) {
    if (Object.keys(u.patch).length) {
      const { error } = await supabase.from("companies").update(u.patch).eq("id", u.companyId);
      if (error) errors.push(`${u.companyName}: Felder nicht aktualisiert`);
      else result.updated++;
    }
    if (u.note) {
      const { error } = await supabase.rpc("log_touch", {
        p_company_id: u.companyId,
        p_kanal: "note",
        p_notiz: u.note.text,
        p_source_key: u.note.sourceKey,
      });
      if (!error) result.notes++;
    }
    if (u.setStatus) {
      const { error } = await supabase.rpc("set_pipeline_status", {
        p_company_id: u.companyId,
        p_pipeline_status: u.setStatus.status,
        p_kanal: "status_change",
        p_naechster_touch: u.setStatus.wv,
      });
      if (error) errors.push(`${u.companyName}: Status nicht gesetzt`);
      else result.statuses++;
    }
  }

  await supabase.from("app_settings").upsert({
    key: SETTINGS_KEY,
    value: {
      at: startedAt,
      source: resolved.source.kind,
      counts: counts(plan),
      result: { ...result, errors: errors.slice(0, 20) },
    },
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/leads");
  revalidatePath("/wiedervorlagen");
  revalidatePath("/plan");
  revalidatePath("/import");
  return result;
}

export async function applyNotionSync(): Promise<Result<NotionSyncResult>> {
  return apply({ kind: "api" });
}

export async function applyNotionExport(records: SourceRecord[]): Promise<Result<NotionSyncResult>> {
  return apply({ kind: "export", records });
}
