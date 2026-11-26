import { headers } from "next/headers";

/** Öffentliche Basis-URL des CRM (für Links in Mails und Asana). */
export async function publicBaseUrl(): Promise<string> {
  const fixed = process.env.CRM_PUBLIC_URL?.trim();
  if (fixed) return fixed.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
