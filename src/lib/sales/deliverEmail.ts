import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/sales/database";
import { sendSmtpMail, smtpConfigured } from "@/lib/sales/mail";

type SalesClient = SupabaseClient<Database, "sales">;

export async function deliverQueuedEmail(
  supabase: SalesClient,
  messageId: string,
): Promise<{ ok: true; status: "sent" | "failed" | "queued" } | { ok: false; error: string }> {
  const { data: msg, error } = await supabase
    .from("email_messages")
    .select("id,company_id,person_id,to_email,subject,body,status,direction")
    .eq("id", messageId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!msg) return { ok: false, error: "E-Mail nicht gefunden." };
  if (msg.direction !== "outbound") {
    return { ok: false, error: "Nur Outbound-Mails können versendet werden." };
  }
  if (msg.status === "sent") return { ok: true, status: "sent" };

  if (!smtpConfigured()) {
    return { ok: true, status: "queued" };
  }

  const result = await sendSmtpMail({
    to: msg.to_email,
    subject: msg.subject,
    text: msg.body,
  });

  if (!result.ok) {
    await supabase
      .from("email_messages")
      .update({ status: "failed", error: result.error })
      .eq("id", messageId);
    return { ok: true, status: "failed" };
  }

  await supabase
    .from("email_messages")
    .update({
      status: "sent",
      provider_ref: result.messageId || null,
      error: null,
    })
    .eq("id", messageId);

  return { ok: true, status: "sent" };
}

export async function drainQueuedEmails(
  supabase: SalesClient,
  limit = 50,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const { data } = await supabase
    .from("email_messages")
    .select("id")
    .eq("direction", "outbound")
    .eq("status", "queued")
    .order("created_at")
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of data ?? []) {
    const res = await deliverQueuedEmail(supabase, row.id);
    if (!res.ok) {
      failed += 1;
      continue;
    }
    if (res.status === "sent") sent += 1;
    else if (res.status === "failed") failed += 1;
    else skipped += 1;
  }
  return { sent, failed, skipped };
}
