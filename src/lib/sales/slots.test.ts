import { describe, expect, it } from "vitest";
import { berlinToIso, freeSlots } from "./slots";

const LONG_AGO = new Date("2020-01-01T00:00:00Z");

describe("berlinToIso", () => {
  it("rechnet Winterzeit (UTC+1) um", () => {
    expect(berlinToIso("2026-12-01", "10:00")).toBe("2026-12-01T09:00:00.000Z");
  });
  it("rechnet Sommerzeit (UTC+2) um", () => {
    expect(berlinToIso("2026-07-01", "10:00")).toBe("2026-07-01T08:00:00.000Z");
  });
});

describe("freeSlots", () => {
  it("liefert das 30-Minuten-Raster von 08:00 bis zum letzten passenden Start", () => {
    const s = freeSlots([], "2026-12-01", 30, { now: LONG_AGO });
    expect(s[0].time).toBe("08:00");
    expect(s.at(-1)!.time).toBe("17:30");
    expect(s.every((x) => x.free)).toBe(true);
  });

  it("markiert Slots, die einen belegten Block schneiden, als belegt", () => {
    // 10:00–11:00 Berlin (Winter) = 09:00–10:00 UTC
    const busy = [{ start: "2026-12-01T09:00:00Z", end: "2026-12-01T10:00:00Z" }];
    const s = freeSlots(busy, "2026-12-01", 30, { now: LONG_AGO });
    const byTime = Object.fromEntries(s.map((x) => [x.time, x.free]));
    expect(byTime["09:30"]).toBe(true);
    expect(byTime["10:00"]).toBe(false);
    expect(byTime["10:30"]).toBe(false);
    expect(byTime["11:00"]).toBe(true);
  });

  it("berücksichtigt die Dauer: 60 Min. ab 09:30 kollidiert mit 10:00", () => {
    const busy = [{ start: "2026-12-01T09:00:00Z", end: "2026-12-01T10:00:00Z" }];
    const s = freeSlots(busy, "2026-12-01", 60, { now: LONG_AGO });
    expect(s.find((x) => x.time === "09:30")!.free).toBe(false);
    expect(s.find((x) => x.time === "09:00")!.free).toBe(true);
    expect(s.at(-1)!.time).toBe("17:00");
  });

  it("sperrt Slots in der Vergangenheit", () => {
    const now = new Date("2026-12-01T11:15:00Z"); // 12:15 Berlin
    const s = freeSlots([], "2026-12-01", 30, { now });
    expect(s.find((x) => x.time === "12:00")!.past).toBe(true);
    expect(s.find((x) => x.time === "12:30")!.free).toBe(true);
  });
});
