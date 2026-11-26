import { describe, expect, it } from "vitest";
import { addDays, eventDays, groupEventsByDay, isoWeek, resolveWeek, weekDays, weekStart } from "./plan";

describe("plan week helpers", () => {
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-11-26")).toBe("2026-11-23"); // Do
    expect(weekStart("2026-11-23")).toBe("2026-11-23"); // Mo
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // So
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(weekDays("2026-12-28")).toEqual([
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
  });

  it("computes ISO calendar weeks", () => {
    expect(isoWeek("2026-11-26")).toBe(48);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(isoWeek("2027-01-04")).toBe(1);
  });

  it("ignores invalid week params", () => {
    const now = new Date("2026-11-26T10:00:00Z");
    expect(resolveWeek("nope", now)).toBe("2026-11-23");
    expect(resolveWeek("2026-12-03", now)).toBe("2026-11-30");
  });
});

describe("eventDays", () => {
  it("places timed events on the Berlin day, not UTC", () => {
    // 23:30 UTC = 00:30 Berlin am Folgetag
    expect(eventDays({ start: "2026-11-26T23:30:00Z", end: "2026-11-27T00:00:00Z", allDay: false })).toEqual([
      "2026-11-27",
    ]);
  });

  it("treats all-day end as exclusive", () => {
    expect(eventDays({ start: "2026-11-26", end: "2026-11-27", allDay: true })).toEqual(["2026-11-26"]);
    expect(eventDays({ start: "2026-11-26", end: "2026-11-29", allDay: true })).toEqual([
      "2026-11-26", "2026-11-27", "2026-11-28",
    ]);
  });

  it("does not spill a midnight end into the next day", () => {
    expect(
      eventDays({ start: "2026-11-26T20:00:00+01:00", end: "2026-11-27T00:00:00+01:00", allDay: false }),
    ).toEqual(["2026-11-26"]);
  });
});

describe("groupEventsByDay", () => {
  it("sorts all-day first, then by start, and drops days outside the week", () => {
    const base = { free: false, htmlLink: null, meetLink: null, attendees: [] };
    const map = groupEventsByDay(
      [
        { ...base, id: "b", title: "B", start: "2026-11-26T14:00:00+01:00", end: "2026-11-26T15:00:00+01:00", allDay: false },
        { ...base, id: "a", title: "A", start: "2026-11-26T09:00:00+01:00", end: "2026-11-26T10:00:00+01:00", allDay: false },
        { ...base, id: "x", title: "X", start: "2026-11-26", end: "2026-11-27", allDay: true },
        { ...base, id: "out", title: "Out", start: "2026-12-10T09:00:00+01:00", end: null, allDay: false },
      ],
      weekDays("2026-11-23"),
    );
    expect(map.get("2026-11-26")?.map((e) => e.id)).toEqual(["x", "a", "b"]);
    expect([...map.values()].flat().some((e) => e.id === "out")).toBe(false);
  });
});
