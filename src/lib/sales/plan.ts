import { BUSINESS_TZ, businessToday } from "./dates";

/** Termin aus dem Google-Kalender, wie ihn `calendar-invite` (action "events") liefert. */
export type CalendarEvent = {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  free: boolean;
  htmlLink: string | null;
  meetLink: string | null;
  attendees: { email: string; response: string | null }[];
};

const ymdFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` + n Kalendertage (reine Datumsrechnung, keine Zeitzone). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Montag der Woche, in der `ymd` liegt. */
export function weekStart(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = So
  return addDays(ymd, dow === 0 ? -6 : 1 - dow);
}

/** Wochenanfang aus dem URL-Parameter `w`, sonst die aktuelle Woche. */
export function resolveWeek(param: string | undefined, now: Date = new Date()): string {
  if (param && YMD.test(param) && !Number.isNaN(Date.parse(param))) return weekStart(param);
  return weekStart(businessToday(now));
}

/** ISO-Kalenderwoche (KW) eines Datums. */
export function isoWeek(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow); // Donnerstag derselben Woche
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Kalendertag (Berlin) eines Zeitpunkts. */
export function berlinYmd(iso: string): string {
  return ymdFmt.format(new Date(iso));
}

/**
 * Tage, an denen ein Termin in der Wochenansicht erscheint.
 * Ganztägig: `end` ist exklusiv (Google-Konvention). Mit Uhrzeit: jeder
 * Berliner Kalendertag zwischen Beginn und Ende (Ende exklusiv auf Mitternacht).
 */
export function eventDays(ev: Pick<CalendarEvent, "start" | "end" | "allDay">): string[] {
  if (!ev.start) return [];
  const first = ev.allDay ? ev.start.slice(0, 10) : berlinYmd(ev.start);
  let last = first;
  if (ev.end) {
    if (ev.allDay) {
      last = addDays(ev.end.slice(0, 10), -1);
    } else {
      // Ende genau um Mitternacht zählt zum Vortag.
      last = berlinYmd(new Date(new Date(ev.end).getTime() - 1).toISOString());
    }
  }
  if (last < first) last = first;
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 45; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Termine nach Tag gruppieren; ganztägige zuerst, dann nach Beginn. */
export function groupEventsByDay<T extends CalendarEvent>(events: T[], days: string[]): Map<string, T[]> {
  const map = new Map<string, T[]>(days.map((d) => [d, []]));
  for (const ev of events) {
    for (const d of eventDays(ev)) map.get(d)?.push(ev);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return (a.start ?? "").localeCompare(b.start ?? "");
    });
  }
  return map;
}
