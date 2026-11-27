import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEAD_VIEWS } from "./leads";
import { applyLeadViewFilter, leadViewFilterSql } from "./leadViewFilters";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20261127120000_lead_view_counts_indexes.sql",
);

/** Whitespace vereinheitlichen, damit Zeilenumbrüche in der Migration egal sind. */
function norm(sql: string) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

describe("sales.lead_view_counts() ↔ applyView()", () => {
  const body = norm(readFileSync(MIGRATION, "utf8"));

  it("zählt genau die Ansichten aus LEAD_VIEWS", () => {
    const keys = [...body.matchAll(/'(\w+)',count\(\*\) filter/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual(LEAD_VIEWS.map((v) => v.key).sort());
  });

  it.each(LEAD_VIEWS.map((v) => v.key))("%s: SQL-Bedingung = Listen-Filter", (key) => {
    const expected = norm(`'${key}', count(*) filter (where ${leadViewFilterSql(key)})`);
    expect(body).toContain(expected);
  });
});

describe("applyLeadViewFilter", () => {
  function recorder() {
    const calls: unknown[][] = [];
    const q = new Proxy(
      {},
      {
        get: (_t, op: string) => (...args: unknown[]) => {
          calls.push([op, ...args]);
          return q;
        },
      },
    ) as never;
    return { q, calls };
  }

  it("Heute fällig nutzt das übergebene Datum", () => {
    const { q, calls } = recorder();
    applyLeadViewFilter(q, "faellig", "2026-11-27");
    expect(calls).toEqual([
      ["neq", "relationship", "Ausgeschlossen"],
      ["not", "naechster_touch", "is", null],
      ["lte", "naechster_touch", "2026-11-27"],
    ]);
  });

  it("Neu blendet unbewertete Notion-Leads aus", () => {
    const { q, calls } = recorder();
    applyLeadViewFilter(q, "neu", "2026-11-27");
    expect(calls).toEqual([
      ["eq", "relationship", "Prospect"],
      ["eq", "status", "neu"],
      ["or", "notion_id.is.null,icp.eq.JA"],
    ]);
  });
});
