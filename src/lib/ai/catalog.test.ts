import { describe, expect, it } from "vitest";
import { dropSnapshots, isChatModel, modelKey, parseModelKey } from "./catalog";

describe("Modell-Schlüssel", () => {
  it("hin und zurück", () => {
    const key = modelKey({ provider: "anthropic", id: "claude-opus-5-5" });
    expect(key).toBe("anthropic:claude-opus-5-5");
    expect(parseModelKey(key)).toEqual({ provider: "anthropic", id: "claude-opus-5-5" });
  });

  it("Modell-IDs mit Doppelpunkt bleiben ganz", () => {
    expect(parseModelKey("openai:ft:gpt-4o:rais")).toEqual({ provider: "openai", id: "ft:gpt-4o:rais" });
  });

  it("unbekannter Anbieter oder leere ID → null", () => {
    expect(parseModelKey("foo:bar")).toBeNull();
    expect(parseModelKey("openai:")).toBeNull();
    expect(parseModelKey("gpt-5")).toBeNull();
  });
});

describe("Chat-Modelle filtern", () => {
  it("wirft Embeddings, Audio und Bilder raus", () => {
    expect(isChatModel("openai", "gpt-5")).toBe(true);
    expect(isChatModel("openai", "text-embedding-3-large")).toBe(false);
    expect(isChatModel("openai", "gpt-4o-mini-tts")).toBe(false);
    expect(isChatModel("openai", "dall-e-3")).toBe(false);
    expect(isChatModel("google", "gemini-2.5-pro")).toBe(true);
    expect(isChatModel("google", "text-embedding-004")).toBe(false);
    expect(isChatModel("mistral", "mistral-embed")).toBe(false);
    expect(isChatModel("xai", "grok-4")).toBe(true);
  });

  it("Datums-Snapshots weg, wenn es die Kurzform gibt", () => {
    expect(dropSnapshots(["gpt-4o", "gpt-4o-2024-08-06", "gpt-x-2025-01-01"])).toEqual([
      "gpt-4o",
      "gpt-x-2025-01-01",
    ]);
  });
});
