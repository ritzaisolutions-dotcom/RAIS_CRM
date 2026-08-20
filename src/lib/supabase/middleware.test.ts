import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Die Middleware ist der einzige Zugriffsschutz der Anwendung — jede Route
 * ausser statischen Assets läuft durch sie. Bis hierher gab es dafür keinen
 * einzigen Test.
 */

const getUser = vi.fn();
const rpc = vi.fn();
let capturedSetAll: ((c: { name: string; value: string; options?: object }[]) => void) | null =
  null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { setAll: (c: never[]) => void } },
  ) => {
    capturedSetAll = opts.cookies.setAll as typeof capturedSetAll;
    return { auth: { getUser }, rpc };
  },
}));

const { updateSession } = await import("./middleware");

const ENV_URL = "https://example.supabase.co";
const ENV_KEY = "anon-key";

function req(path: string, search = "") {
  return new NextRequest(`https://crm.example.com${path}${search}`);
}

function asAllowlistedUser() {
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  rpc.mockResolvedValue({ data: true, error: null });
}

function asSignedOut() {
  getUser.mockResolvedValue({ data: { user: null } });
}

function asNonAllowlistedUser() {
  getUser.mockResolvedValue({ data: { user: { id: "u2" } } });
  rpc.mockResolvedValue({ data: false, error: null });
}

beforeEach(() => {
  vi.resetAllMocks();
  capturedSetAll = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = ENV_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ENV_KEY;
});

describe("updateSession — abgemeldet", () => {
  it("leitet geschützte Routen auf /login um und merkt sich das Ziel", async () => {
    asSignedOut();
    const res = await updateSession(req("/firma/abc", "?tab=kontakte"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/firma/abc?tab=kontakte");
  });

  it("lässt /login selbst durch — sonst gäbe es eine Redirect-Schleife", async () => {
    asSignedOut();
    const res = await updateSession(req("/login"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("prüft die Allowlist nicht, wenn niemand angemeldet ist", async () => {
    asSignedOut();
    await updateSession(req("/liste"));
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("updateSession — angemeldet, nicht freigeschaltet", () => {
  it("leitet auf /kein-zugriff statt einen JSON-Body auszuliefern", async () => {
    asNonAllowlistedUser();
    const res = await updateSession(req("/liste"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe(
      "/kein-zugriff",
    );
  });

  it("lässt /kein-zugriff durch, damit der Abmelden-Button erreichbar bleibt", async () => {
    asNonAllowlistedUser();
    const res = await updateSession(req("/kein-zugriff"));
    expect(res.status).toBe(200);
  });

  it("sperrt /login nicht mit 403 — sonst käme man nie wieder heraus", async () => {
    // Regression: früher lief die Allowlist-Prüfung vor dem Login-Zweig, ein
    // gesperrter Nutzer bekam auf /login einen 403-JSON-Body und konnte sich
    // weder abmelden noch mit einem anderen Konto anmelden.
    asNonAllowlistedUser();
    const res = await updateSession(req("/login"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe(
      "/kein-zugriff",
    );
  });

  it("antwortet mit 503, wenn die Allowlist-Prüfung fehlschlägt", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u3" } } });
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await updateSession(req("/liste"));
    expect(res.status).toBe(503);
  });
});

describe("updateSession — angemeldet und freigeschaltet", () => {
  it("lässt normale Routen passieren", async () => {
    asAllowlistedUser();
    const res = await updateSession(req("/liste"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("leitet von /login auf /liste", async () => {
    asAllowlistedUser();
    const res = await updateSession(req("/login"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/liste");
  });

  it("leitet von /kein-zugriff auf /liste", async () => {
    asAllowlistedUser();
    const res = await updateSession(req("/kein-zugriff"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/liste");
  });
});

describe("updateSession — Passwort zurücksetzen", () => {
  it("ist abgemeldet erreichbar", async () => {
    asSignedOut();
    const res = await updateSession(req("/passwort-neu"));
    expect(res.status).toBe(200);
  });

  it("bleibt in der Recovery-Session erreichbar", async () => {
    // Der Recovery-Link stellt eine Session her. Ohne Ausnahme würde die
    // Middleware sofort nach /liste umleiten und das Setzen des neuen
    // Passworts wäre nicht möglich.
    asAllowlistedUser();
    const res = await updateSession(req("/passwort-neu"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("ist auch für nicht freigeschaltete Konten erreichbar", async () => {
    asNonAllowlistedUser();
    const res = await updateSession(req("/passwort-neu"));
    expect(res.status).toBe(200);
  });
});

describe("updateSession — Cookie-Weitergabe", () => {
  it("überträgt rotierte Auth-Cookies auf die Redirect-Antwort", async () => {
    // Regression für den Logout-Loop: `supabaseResponse` trägt die frisch
    // rotierten Tokens. Frühere Redirects bauten eine neue Antwort und
    // verwarfen sie — der nächste Request spielte den alten Refresh-Token
    // erneut ab.
    getUser.mockImplementation(async () => {
      capturedSetAll?.([
        { name: "sb-access-token", value: "neu", options: { path: "/" } },
      ]);
      return { data: { user: { id: "u1" } } };
    });
    rpc.mockResolvedValue({ data: true, error: null });

    const res = await updateSession(req("/login"));
    expect(res.status).toBe(307);
    expect(res.cookies.get("sb-access-token")?.value).toBe("neu");
  });

  it("überträgt rotierte Cookies auch auf den Login-Redirect", async () => {
    getUser.mockImplementation(async () => {
      capturedSetAll?.([
        { name: "sb-access-token", value: "rotiert", options: { path: "/" } },
      ]);
      return { data: { user: null } };
    });

    const res = await updateSession(req("/liste"));
    expect(res.status).toBe(307);
    expect(res.cookies.get("sb-access-token")?.value).toBe("rotiert");
  });
});

describe("updateSession — fehlende Konfiguration", () => {
  it("fällt geschlossen aus, wenn die Supabase-Env fehlt", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await updateSession(req("/liste"));
    expect(res.status).toBe(503);
    expect(getUser).not.toHaveBeenCalled();
  });
});
