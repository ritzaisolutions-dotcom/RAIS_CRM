import type { NextConfig } from "next";

/**
 * Einzige Quelle der Wahrheit für Security-Header.
 *
 * Die Header standen zusätzlich in `vercel.json` — als schwächere, bereits
 * auseinandergelaufene Teilmenge (ohne COOP, ohne HSTS, ohne `payment=()`).
 * Der Block dort ist entfernt; hier ist die einzige Definition.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  });
}

/**
 * Content-Security-Policy — jetzt erzwungen statt nur berichtet.
 *
 * Bisher war die CSP an `CSP_REPORT_ONLY=1` gekoppelt, und diese Variable ist
 * in `.env.example` auskommentiert: produktiv lief damit gar keine CSP.
 *
 * `'unsafe-eval'` ist entfernt. `'unsafe-inline'` bleibt für `script-src`
 * notwendig, solange Next.js seine Bootstrap- und Flight-Daten als Inline-Skript
 * ausliefert — ohne Nonce-Middleware lässt sich das nicht abschalten. Moderne
 * Browser ignorieren `'unsafe-inline'`, sobald ein Hash oder eine Nonce
 * vorhanden ist; der Schritt auf Nonces gehört in eine eigene Änderung, weil er
 * die Middleware anfassen muss.
 *
 * `style-src` braucht `'unsafe-inline'` wegen der Inline-Styles von Tailwind
 * und `next/font`.
 */
/**
 * `connect-src` wird aus der konfigurierten Supabase-URL abgeleitet.
 *
 * Ein festes `https://*.supabase.co` hätte zwei Nachteile: es erlaubt *jedes*
 * Supabase-Projekt der Welt, und es blockiert die lokale Entwicklung gegen
 * `http://127.0.0.1:54321`, weil die nicht unter `'self'` fällt.
 */
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const { origin, host, protocol } = new URL(raw);
    const ws = protocol === "https:" ? `wss://${host}` : `ws://${host}`;
    return [origin, ws];
  } catch {
    return [];
  }
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  ["connect-src 'self'", ...supabaseOrigins()].join(" "),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Notausstieg: CSP_REPORT_ONLY=1 schaltet auf Report-Only zurück, falls die
// erzwungene Policy in Preview etwas blockiert, das noch gebraucht wird.
securityHeaders.push({
  key:
    process.env.CSP_REPORT_ONLY === "1"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
  value: contentSecurityPolicy,
});

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
