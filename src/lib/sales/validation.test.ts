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

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.com/x",
    "vbscript:msgbox(1)",
    "nichteinedomain",
    "http://",
  ])("rejects non-http(s) or unparsbare URL %s", (website) => {
    const result = companyBasicsSchema.safeParse({
      companyId,
      patch: { name: "Test GmbH", website },
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["firma.de", "https://firma.de"],
    ["www.firma.de", "https://www.firma.de"],
    ["firma.de/kontakt", "https://firma.de/kontakt"],
    ["https://firma.de", "https://firma.de"],
    ["http://firma.de", "http://firma.de"],
  ])(
    "akzeptiert %s und normalisiert auf %s",
    (website, expected) => {
      const result = companyBasicsSchema.safeParse({
        companyId,
        patch: { name: "Test GmbH", website },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.patch.website).toBe(expected);
      }
    },
  );

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
