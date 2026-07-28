import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/sales/database";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY fehlen");
  }
  return createBrowserClient<Database, "sales">(url, key, {
    db: { schema: "sales" },
  });
}
