import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/sales/database";
import { sendSmtpMail, smtpConfigured } from "@/lib/sales/mail";
import { ATTACHMENT_BUCKET } from "@/lib/sales/types";

type SalesClient = SupabaseClient<Database, "sales">;

export async function deliverQueuedEmail(
  supabase: SalesClient,
  messageId: string,
): Promise<{ ok: true; status: "sent" | "failed" | "queued" } | { ok: false; error: string }> {
  const { data: msg, error } = await supabase
    .from("email_messages")
    .select("id,company_id,person_id,to_email,subject,body,status,direction,attachment_ids")
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

  const files = await loadAttachments(supabase, msg.attachment_ids ?? []);
  if (!files.ok) {
    await supabase
      .from("email_messages")
      .update({ status: "failed", error: files.error })
      .eq("id", messageId);
    return { ok: true, status: "failed" };
  }

  const result = await sendSmtpMail({
    to: msg.to_email,
    subject: msg.subject,
    text: msg.body,
    attachments: files.files,
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

/** Lädt die PDF-Anhänge aus dem privaten Bucket für den SMTP-Versand. */
async function loadAttachments(
  supabase: SalesClient,
  ids: string[],
): Promise<
  | { ok: true; files: { filename: string; content: Buffer; contentType: string }[] }
  | { ok: false; error: string }
> {
  if (!ids.length) return { ok: true, files: [] };
  const { data, error } = await supabase
    .from("email_attachments")
    .select("id,name,storage_path,mime_type")
    .in("id", ids);
  if (error) return { ok: false, error: `Anhänge: ${error.message}` };
  const byId = new Map((data ?? []).map((a) => [a.id, a]));
  const files: { filename: string; content: Buffer; contentType: string }[] = [];
  for (const id of ids) {
    const att = byId.get(id);
    if (!att) return { ok: false, error: "Anhang nicht gefunden." };
    const { data: blob, error: dlError } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .download(att.storage_path);
    if (dlError || !blob) {
      return { ok: false, error: `Anhang „${att.name}“ konnte nicht geladen werden.` };
    }
    const filename = att.name.toLowerCase().endsWith(".pdf") ? att.name : `${att.name}.pdf`;
    files.push({
      filename,
      content: Buffer.from(await blob.arrayBuffer()),
      contentType: att.mime_type,
    });
  }
  return { ok: true, files };
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
