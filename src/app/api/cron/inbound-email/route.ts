import { NextRequest } from "next/server";
import { assertCronAuth } from "@/lib/sales/cronAuth";
import { syncInboundEmail } from "@/lib/sales/inboundEmail";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  try {
    const supabase = createAdminClient();
    const result = await syncInboundEmail(supabase);
    if (result.error && result.matched === 0 && result.quarantined === 0) {
      return Response.json({ error: result.error }, { status: 500 });
    }
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Inbound-Cron fehlgeschlagen";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
