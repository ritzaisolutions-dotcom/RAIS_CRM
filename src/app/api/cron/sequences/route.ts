import { NextRequest } from "next/server";
import { assertCronAuth } from "@/lib/sales/cronAuth";
import { drainQueuedEmails } from "@/lib/sales/deliverEmail";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("run_due_sequence_steps");
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    const drained = await drainQueuedEmails(supabase);
    return Response.json({
      ok: true,
      ran: typeof data === "number" ? data : 0,
      drained,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cron fehlgeschlagen";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
