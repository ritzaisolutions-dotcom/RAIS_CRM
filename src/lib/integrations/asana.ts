/**
 * Asana-Anbindung (nur Server). Legt Aufgaben im konfigurierten Projekt an.
 *
 * Env:
 *   ASANA_ACCESS_TOKEN  – Personal Access Token (Asana → Profil → Apps → Developer)
 *   ASANA_PROJECT_GID   – Zielprojekt (Standard: „RAIS“)
 *   ASANA_ASSIGNEE      – optional, Standard „me“ (Token-Inhaber)
 */

const DEFAULT_PROJECT_GID = "1220366143689762"; // Projekt „RAIS“

export function asanaConfigured(): boolean {
  return Boolean(process.env.ASANA_ACCESS_TOKEN?.trim());
}

export type AsanaTaskInput = {
  name: string;
  notes?: string;
  /** Ganztägig fällig (YYYY-MM-DD) … */
  dueOn?: string | null;
  /** … oder mit Uhrzeit (ISO). Hat Vorrang vor dueOn. */
  dueAt?: string | null;
};

export async function createAsanaTask(
  input: AsanaTaskInput,
): Promise<{ ok: true; gid: string; url: string | null } | { error: string }> {
  const token = process.env.ASANA_ACCESS_TOKEN?.trim();
  if (!token) return { error: "Asana ist nicht verbunden (ASANA_ACCESS_TOKEN fehlt)." };

  const data: Record<string, unknown> = {
    name: input.name.slice(0, 250),
    notes: input.notes ?? "",
    projects: [process.env.ASANA_PROJECT_GID?.trim() || DEFAULT_PROJECT_GID],
    assignee: process.env.ASANA_ASSIGNEE?.trim() || "me",
  };
  if (input.dueAt) data.due_at = input.dueAt;
  else if (input.dueOn) data.due_on = input.dueOn;

  try {
    const res = await fetch("https://app.asana.com/api/1.0/tasks?opt_fields=gid,permalink_url", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ data }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { gid?: string; permalink_url?: string };
      errors?: { message?: string }[];
    };
    if (!res.ok || !json.data?.gid) {
      const msg = json.errors?.[0]?.message;
      return { error: `Asana-Aufgabe konnte nicht angelegt werden${msg ? `: ${msg}` : ` (${res.status})`}.` };
    }
    return { ok: true, gid: json.data.gid, url: json.data.permalink_url ?? null };
  } catch {
    return { error: "Asana ist gerade nicht erreichbar." };
  }
}
