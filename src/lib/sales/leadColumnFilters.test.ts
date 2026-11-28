import { describe, expect, it } from "vitest";
import { applyLeadColumnFilters, parseLeadColumnFilters } from "./leadColumnFilters";

/** Zeichnet Aufrufe des Query-Builders auf. */
function recorder() {
  const calls: unknown[][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "neq", "in", "lt", "lte", "gte", "gt", "is", "not", "or"]) {
    q[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return q;
    };
  }
  return { q, calls };
}

describe("parseLeadColumnFilters", () => {
  it("liest gültige Werte und verwirft unbekannte", () => {
    expect(parseLeadColumnFilters({ icp: "JA", st: "neu", wv: "quatsch", crm: "leer" })).toEqual({
      icp: "JA",
      status: "neu",
      crm: "leer",
    });
  });
});

describe("applyLeadColumnFilters", () => {
  it("ICP ja filtert auf icp = JA", () => {
    const { q, calls } = recorder();
    applyLeadColumnFilters(q as never, { icp: "JA" }, "2026-11-27");
    expect(calls).toEqual([["eq", "icp", "JA"]]);
  });

  it("Nicht erreicht bündelt alle Stufen", () => {
    const { q, calls } = recorder();
    applyLeadColumnFilters(q as never, { status: "kein_anschluss_1" }, "2026-11-27");
    expect(calls[0][0]).toBe("in");
    expect((calls[0][2] as string[]).length).toBe(5);
  });

  it("Letzter Kontakt > 7 Tage rechnet ab dem Berliner Tag", () => {
    const { q, calls } = recorder();
    applyLeadColumnFilters(q as never, { lk: "7" }, "2026-11-27");
    expect(calls).toEqual([["lt", "letzter_kontakt_am", "2026-11-20T00:00:00.000Z"]]);
  });
});
