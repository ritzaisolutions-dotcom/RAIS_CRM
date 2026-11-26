"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  NotionError,
  fetchIcpLeadPages,
  fetchPageBlocks,
  notionConfigured,
} from "@/lib/integrations/notion";
import { businessToday } from "@/lib/sales/dates";
import {
  SKIP_LABELS,
  blocksToText,
  mapNotionPage,
  planSync,
  type CompanyPatch,
  type ExistingCompany,
  type NotionPage,
  type SkipReason,
  type SyncPlan,
} from "@/lib/sales/notionSync";
import { safeDatabaseError } from "@/lib/sales/validation";
import type { ImportLeadResult } from "@/lib/sales/types";

/**
 * „Sync aus Notion“: holt die ICP-JA-Leads aus Notion und gleicht sie mit
 * dem CRM ab. `previewNotionSync` liest nur; `applyNotionSync` rechnet den
 * Plan serverseitig neu (nichts vom Client wird übernommen) und schreibt.
 */

const SETTINGS_KEY = "notion_leads_sync";
/** Erster Sync: alles bis zum manuellen Import vom 26.11. gilt als übernommen. */
const BASELINE = "2026-11-26T18:00:00.000Z";

export type NotionSyncState = { configured: boolean; lastSync: string | null; lastCounts: SyncCounts | null };
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

type Result<T> = T | { error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

type Supabase = NonNullable<Awaited<ReturnType<typeof requireUser>>>;

async function readState(supabase: Supabase): Promise<{ at: string | null; counts: SyncCounts | null }> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  const v = (data?.value ?? {}) as { at?: string; counts?: SyncCounts };
  return { at: v.at ?? null, counts: v.counts ?? null };
}

export async function getNotionSyncState(): Promise<NotionSyncState> {
  const supabase = await requireUser();
  if (!supabase) return { configured: false, lastSync: null, lastCounts: null };
  const s = await readState(supabase);
  return { configured: notionConfigured(), lastSync: s.at, lastCounts: s.counts };
}

async function loadCompanies(supabase: Supabase): Promise<ExistingCompany[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("id,name,stadt,quell_url,pipeline_status,telefon,website,instagram_url,crm_system,inserate_aktiv,meta_ads")
    .range(0, 9999);
  if (error) throw error;
  return (data ?? []) as ExistingCompany[];
}

function notionMessage(e: unknown): string {
  if (e instanceof NotionError) {
    if (e.status === 401) return "Notion-Token ungültig. Bitte NOTION_TOKEN prüfen.";
    if (e.status === 404)
      return "Datenbank nicht gefunden. Ist sie mit der Notion-Integration geteilt (⋯ → Verbindungen)?";
    return `Notion-Fehler: ${e.message}`;
  }
  return "Notion nicht erreichbar.";
}

async function buildPlan(supabase: Supabase) {
  const today = businessToday();
  const [pages, companies, state] = await Promise.all([fetchIcpLeadPages(), loadCompanies(supabase), readState(supabase)]);
  const leads = pages.map((p) => mapNotionPage(p, "", today));
  const plan = planSync(leads, companies, { lastSync: state.at ?? BASELINE, today });
  return { pages, plan, today };
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
};

export async function previewNotionSync(): Promise<Result<NotionSyncPreview>> {
  const supabase = await requireUser();
  if (!supabase) return { error: "Nicht angemeldet." };
  if (!notionConfigured()) return { error: "Notion ist nicht verbunden (NOTION_TOKEN fehlt)." };
  let built;
  try {
    built = await buildPlan(supabase);
  } catch (e) {
    return { error: notionMessage(e) };
  }
  const { pages, plan } = built;
  const skipped = Object.entries(
    plan.skipped.reduce<Record<string, number>>((m, s) => ((m[s.reason] = (m[s.reason] ?? 0) + 1), m), {}),
  ).map(([reason, count]) => ({ reason: SKIP_LABELS[reason as SkipReason], count }));
  return {
    ok: true,
    pages: pages.length,
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

/** Seiteninhalt für neue Leads (begrenzt, 3 parallel wegen Notion-Rate-Limit). */
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

export type NotionSyncResult = {
  ok: true;
  created: number;
  duplicates: number;
  updated: number;
  notes: number;
  statuses: number;
  errors: string[];
};

export async function applyNotionSync(): Promise<Result<NotionSyncResult>> {
  const supabase = await requireUser();
  if (!supabase) return { error: "Nicht angemeldet." };
  if (!notionConfigured()) return { error: "Notion ist nicht verbunden (NOTION_TOKEN fehlt)." };

  let built;
  try {
    built = await buildPlan(supabase);
  } catch (e) {
    return { error: notionMessage(e) };
  }
  const { pages, plan, today } = built;
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const result: NotionSyncResult = { ok: true, created: 0, duplicates: 0, updated: 0, notes: 0, statuses: 0, errors };

  // 1) Neue Leads – mit Seiteninhalt in der ersten Notiz.
  const pageById = new Map<string, NotionPage>(pages.map((p) => [p.id, p]));
  const bodies = await fetchBodies(plan.create.map((c) => c.lead.pageId));
  const creates = plan.create.map((c) => {
    const body = bodies.get(c.lead.pageId);
    const page = pageById.get(c.lead.pageId);
    return body && page ? { ...c, lead: { ...mapNotionPage(page, body, today), status: c.lead.status } } : c;
  });

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
      const qual: CompanyPatch = {};
      if (lead.crm) qual.crm_system = lead.crm;
      if (lead.inserate !== null) qual.inserate_aktiv = lead.inserate;
      if (lead.meta !== null) qual.meta_ads = lead.meta;
      if (Object.keys(qual).length) await supabase.from("companies").update(qual).eq("id", r.company_id);
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
    value: { at: startedAt, counts: counts(plan), result: { ...result, errors: errors.slice(0, 20) } },
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/leads");
  revalidatePath("/wiedervorlagen");
  revalidatePath("/plan");
  revalidatePath("/import");
  return result;
}
