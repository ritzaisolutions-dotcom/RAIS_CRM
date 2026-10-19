/**
 * Thin dial abstraction — today native `tel:`; later a VoIP provider can plug in.
 */
export function placeCallHref(telefon: string): string {
  const cleaned = telefon.replace(/[^\d+]/g, "");
  return `tel:${cleaned}`;
}

export function normalizePhoneDisplay(telefon: string): string {
  return telefon.trim();
}
