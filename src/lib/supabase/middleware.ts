import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isLogin = path === "/login";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Dienst vorübergehend nicht verfügbar." },
      { status: 503 },
    );
  }

  const supabase = createServerClient(url, key, {
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

  if (!user && !isLogin) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(redirect);
  }

  if (user) {
    const { data: isAppUser, error } = await supabase.rpc("is_app_user");
    if (error) {
      return NextResponse.json(
        { error: "Berechtigung konnte nicht geprüft werden." },
        { status: 503 },
      );
    }
    if (!isAppUser) {
      return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
    }
  }

  if (user && isLogin) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/liste";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return supabaseResponse;
}
