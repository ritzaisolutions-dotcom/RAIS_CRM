import { BUSINESS_TZ } from "./dates";

/** Berliner Wandzeit (YYYY-MM-DD + HH:MM) → ISO-Zeitpunkt, sommerzeitsicher. */
export function berlinToIso(day: string, time: string): string {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const shown = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(guess);
  const [sh, sm] = shown.split(":").map(Number);
  const delta = (h * 60 + mi - ((sh % 24) * 60 + sm)) * 60_000;
  return new Date(guess.getTime() + delta).toISOString();
}

export type Slot = { time: string; startsAt: string; free: boolean; past: boolean };

/**
 * Termin-Vorschläge eines Tages im Raster (Standard 30 Min., 08:00–18:00 Berlin).
 * Ein Slot ist frei, wenn [Start, Start+Dauer) keinen belegten Block schneidet
 * und nicht in der Vergangenheit liegt.
 */
export function freeSlots(
  busy: { start: string; end: string }[],
  day: string,
  durationMin: number,
  opts: { from?: string; to?: string; stepMin?: number; now?: Date } = {},
): Slot[] {
  const { from = "08:00", to = "18:00", stepMin = 30, now = new Date() } = opts;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const blocks = busy.map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as const);
  const out: Slot[] = [];
  for (let m = toMin(from); m + durationMin <= toMin(to); m += stepMin) {
    const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const startsAt = berlinToIso(day, time);
    const s = new Date(startsAt).getTime();
    const e = s + durationMin * 60_000;
    const past = s <= now.getTime();
    const overlaps = blocks.some(([bs, be]) => bs < e && be > s);
    out.push({ time, startsAt, free: !past && !overlaps, past });
  }
  return out;
}
