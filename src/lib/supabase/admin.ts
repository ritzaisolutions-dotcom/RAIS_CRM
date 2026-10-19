import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/sales/database";

/** Service-role client for cron / inbound workers. Bypasses RLS; never import in client components. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL fehlen für Cron-Jobs",
    );
  }
  return createClient<Database, "sales">(url, key, {
    db: { schema: "sales" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
