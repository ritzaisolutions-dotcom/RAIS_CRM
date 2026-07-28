import { describe, expect, it } from "vitest";
import {
  companyBasicsSchema,
  pipelineChangeSchema,
  touchpointSchema,
} from "./validation";

const companyId = "11111111-1111-4111-8111-111111111111";

describe("sales runtime validation", () => {
  it("rejects external and non-http company URLs", () => {
    const result = companyBasicsSchema.safeParse({
      companyId,
      patch: {
        name: "Test GmbH",
        website: "javascript:alert(1)",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects manipulated pipeline enums and dates", () => {
    expect(
      pipelineChangeSchema.safeParse({
        companyId,
        pipelineStatus: "admin",
        naechsterTouch: "tomorrow",
      }).success,
    ).toBe(false);
  });

  it("enforces cancellation reason semantics", () => {
    const result = touchpointSchema.safeParse({
      company_id: companyId,
      person_id: null,
      kanal: "call",
      ergebnis: "termin_gebucht",
      notiz: null,
      naechster_touch: null,
      abbruchgrund: "kein_budget",
    });
    expect(result.success).toBe(false);
  });
});
