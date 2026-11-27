import { describe, expect, it } from "vitest";
import {
  RELOAD_GUARD_MS,
  UPDATE_RELOAD_KEY,
  claimAutoReload,
  isStaleDeployError,
} from "./appUpdate";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe("isStaleDeployError", () => {
  it.each([
    new Error(
      "Failed to find Server Action. This request might be from an older or newer deployment.",
    ),
    Object.assign(new Error('Server Action "abc123" was not found on the server.'), {
      name: "UnrecognizedActionError",
    }),
    Object.assign(new Error("Loading chunk 42 failed."), { name: "ChunkLoadError" }),
    new Error("Loading CSS chunk app-layout failed."),
    new TypeError("Failed to fetch dynamically imported module: /_next/static/x.js"),
    "Failed to find Server Action",
  ])("erkennt %s", (reason) => {
    expect(isStaleDeployError(reason)).toBe(true);
  });

  it.each([
    new Error("Netzwerkfehler"),
    new Error("duplicate key value violates unique constraint"),
    null,
    undefined,
    42,
    {},
  ])("ignoriert %s", (reason) => {
    expect(isStaleDeployError(reason)).toBe(false);
  });
});

describe("claimAutoReload", () => {
  it("erlaubt den ersten Reload und merkt sich den Zeitpunkt", () => {
    const s = memoryStorage();
    expect(claimAutoReload(s, 1_000_000)).toBe(true);
    expect(s.data.get(UPDATE_RELOAD_KEY)).toBe("1000000");
  });

  it("sperrt einen zweiten Reload innerhalb des Fensters", () => {
    const s = memoryStorage({ [UPDATE_RELOAD_KEY]: "1000000" });
    expect(claimAutoReload(s, 1_000_000 + RELOAD_GUARD_MS - 1)).toBe(false);
  });

  it("erlaubt einen Reload nach Ablauf des Fensters", () => {
    const s = memoryStorage({ [UPDATE_RELOAD_KEY]: "1000000" });
    expect(claimAutoReload(s, 1_000_000 + RELOAD_GUARD_MS)).toBe(true);
  });

  it("lädt nicht automatisch, wenn der Storage wirft", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
    };
    expect(claimAutoReload(broken, 1)).toBe(false);
  });
});
