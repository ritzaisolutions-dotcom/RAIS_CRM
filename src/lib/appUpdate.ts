/**
 * Erkennen und Behandeln eines veralteten Tabs nach einem Deployment.
 *
 * Nach jedem Deploy ändern sich Server-Action-IDs und Chunk-Namen. Ein Tab,
 * der noch das alte JavaScript hält, ruft dann Actions auf, die es nicht mehr
 * gibt, oder lädt Chunks, die weg sind. Statt still nichts zu tun, laden wir
 * einmal neu — mit Sperre gegen Endlosschleifen.
 */

export const UPDATE_RELOAD_KEY = "rais-update-reload-at";
/** Innerhalb dieses Fensters nach einem Auto-Reload wird nicht erneut geladen. */
export const RELOAD_GUARD_MS = 60_000;
/** Header, den Next setzt, wenn eine Server Action unbekannt ist. */
export const ACTION_NOT_FOUND_HEADER = "x-nextjs-action-not-found";
/** Event, über das `error.tsx` & Co. den UpdateWatcher anstoßen. */
export const STALE_EVENT = "rais:stale-deployment";

const STALE_PATTERNS = [
  /Failed to find Server Action/i,
  /Server Action "[^"]*" was not found on the server/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
];

/** Ist das ein Fehler, der typischerweise von einem veralteten Deployment kommt? */
export function isStaleDeployError(reason: unknown): boolean {
  if (!reason) return false;
  if (typeof reason === "string") return STALE_PATTERNS.some((p) => p.test(reason));
  if (typeof reason !== "object") return false;
  const { name, message } = reason as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError" || name === "UnrecognizedActionError") return true;
  return typeof message === "string" && STALE_PATTERNS.some((p) => p.test(message));
}

type MinimalStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Darf jetzt automatisch neu geladen werden? Merkt sich den Zeitpunkt, damit
 * ein Fehler, der auch nach dem Reload bleibt, keine Schleife auslöst.
 */
export function claimAutoReload(
  storage: MinimalStorage | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!storage) return true;
  try {
    const last = Number(storage.getItem(UPDATE_RELOAD_KEY) ?? 0);
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GUARD_MS) {
      return false;
    }
    storage.setItem(UPDATE_RELOAD_KEY, String(now));
    return true;
  } catch {
    // Kein Storage (z. B. gesperrt) → lieber nicht automatisch laden.
    return false;
  }
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Lädt einmal neu, wenn die Sperre es erlaubt. Gibt zurück, ob geladen wird. */
export function reloadOnce(): boolean {
  if (!claimAutoReload(safeSessionStorage())) return false;
  window.location.reload();
  return true;
}

/** Meldet einen veralteten Stand an den UpdateWatcher. */
export function reportStaleDeployment() {
  window.dispatchEvent(new Event(STALE_EVENT));
}
