import type { NotionPage } from "@/lib/sales/notionSync";

/**
 * Notion-API (nur serverseitig). Benötigt eine interne Integration, mit der
 * die Datenbank „ImmoScout Makler Leads“ geteilt ist:
 *   NOTION_TOKEN               – Secret der Integration (ntn_…)
 *   NOTION_LEADS_DATABASE_ID   – optional, Standard: RAIS-Datenbank
 */

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";
const DEFAULT_DB = "3ea66e6bc8408346b1de81dd8fe8979e";

export function notionConfigured(): boolean {
  return Boolean(process.env.NOTION_TOKEN?.trim());
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN?.trim() ?? ""}`,
    "Notion-Version": VERSION,
    "Content-Type": "application/json",
  };
}

export class NotionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: headers(), cache: "no-store" });
  if (res.status === 429 && attempt < 4) {
    const wait = Number(res.headers.get("retry-after") ?? "1") * 1000;
    await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
    return call<T>(path, init, attempt + 1);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    throw new NotionError(body.code ?? `notion_${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

/**
 * Alle Seiten der Lead-Datenbank, paginiert. Früher nur ICP = JA; jetzt alle,
 * damit auch Grenzfall/RAUS/„Kein Interesse“ im CRM landen und nie neu gezogen werden.
 */
export async function fetchLeadPages(): Promise<NotionPage[]> {
  const db = process.env.NOTION_LEADS_DATABASE_ID?.trim() || DEFAULT_DB;
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const res = await call<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
      `/databases/${db}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    );
    pages.push(...res.results);
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return pages;
}

/** Blöcke der ersten Ebene einer Seite (für den Seiteninhalt in der Notiz). */
export async function fetchPageBlocks(pageId: string): Promise<{ type: string; [key: string]: unknown }[]> {
  const res = await call<{ results: { type: string; [key: string]: unknown }[] }>(
    `/blocks/${pageId}/children?page_size=100`,
  );
  return res.results;
}
