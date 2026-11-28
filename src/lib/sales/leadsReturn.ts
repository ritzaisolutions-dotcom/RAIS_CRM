/**
 * Zuletzt besuchte Lead-Liste (Ansicht, Filter, Seite) für den Zurück-Pfeil
 * im Lead-Detail. Liegt im sessionStorage, gilt also nur für diesen Tab.
 */
const KEY = "leads:return";

/** Nur interne Lead-Listen-URLs zulassen. */
export function isLeadsListUrl(url: string | null | undefined): url is string {
  return !!url && (url === "/leads" || url.startsWith("/leads?"));
}

export function rememberLeadsUrl(url: string) {
  if (!isLeadsListUrl(url)) return;
  try {
    sessionStorage.setItem(KEY, url);
  } catch {
    /* privater Modus o. Ä. */
  }
}

export function readLeadsUrl(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return isLeadsListUrl(v) ? v : null;
  } catch {
    return null;
  }
}
