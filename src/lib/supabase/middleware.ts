import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/sales/database";

/** Pfad, auf dem ein eingeloggter Nutzer ohne Allowlist-Eintrag landet. */
const NO_ACCESS_PATH = "/kein-zugriff";

/**
 * Passwort-Zurücksetzen muss in beiden Zuständen erreichbar sein: abgemeldet
 * (Link anfordern) und angemeldet (der Recovery-Link stellt eine Session her,
 * bevor das neue Passwort gesetzt wird). Ohne diese Ausnahme würde der zweite
 * Schritt sofort nach /liste weggeleitet und der Ablauf wäre nicht benutzbar.
 */
const PASSWORD_RESET_PATH = "/passwort-neu";

/**
 * Überträgt die von Supabase rotierten Auth-Cookies auf eine andere Antwort.
 *
 * `supabaseResponse` ist das einzige Objekt, das die frisch erneuerten Tokens
 * trägt. Wer stattdessen ein neues `NextResponse.redirect(...)` zurückgibt,
 * verwirft sie — der nächste Request spielt dann den alten Refresh-Token erneut
 * ab, was bei aktivierter Token-Rotation eine Logout-Schleife auslösen kann.
 */
function withAuthCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
  return target;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isLogin = path === "/login";
  const isNoAccess = path === NO_ACCESS_PATH;
  const isPasswordReset = path === PASSWORD_RESET_PATH;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Dienst vorübergehend nicht verfügbar." },
      { status: 503 },
    );
  }

  const supabase = createServerClient<Database, "sales">(url, key, {
    db: { schema: "sales" },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Passwort-Zurücksetzen ist in jedem Anmeldezustand offen.
  if (isPasswordReset) return supabaseResponse;

  // Nicht eingeloggt → Login, Ziel für den Rücksprung merken.
  if (!user) {
    if (isLogin) return supabaseResponse;
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return withAuthCookies(NextResponse.redirect(redirect), supabaseResponse);
  }

  // Eingeloggt, aber nicht in sales.app_users freigeschaltet.
  //
  // Die Prüfung läuft bewusst NACH dem Login-Zweig und leitet auf eine echte
  // Seite statt auf einen JSON-Body um: sonst sitzt ein gesperrter Nutzer in
  // einer nackten Fehlerausgabe fest, aus der er sich nicht abmelden kann.
  const { data: isAppUser, error } = await supabase.rpc("is_app_user");
  if (error) {
    return NextResponse.json(
      { error: "Berechtigung konnte nicht geprüft werden." },
      { status: 503 },
    );
  }

  if (!isAppUser) {
    // /kein-zugriff selbst muss erreichbar bleiben — dort liegt der Abmelden-Button.
    if (isNoAccess) return supabaseResponse;
    const redirect = request.nextUrl.clone();
    redirect.pathname = NO_ACCESS_PATH;
    redirect.search = "";
    return withAuthCookies(NextResponse.redirect(redirect), supabaseResponse);
  }

  // Freigeschaltet: Login und Sperrseite sind nicht mehr sinnvoll.
  if (isLogin || isNoAccess) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/liste";
    redirect.search = "";
    return withAuthCookies(NextResponse.redirect(redirect), supabaseResponse);
  }

  return supabaseResponse;
}
