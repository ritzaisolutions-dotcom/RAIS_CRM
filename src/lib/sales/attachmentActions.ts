"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  type EmailAttachment,
} from "@/lib/sales/types";

/**
 * PDF-Dokumente (Broschüre, Preisliste …), die beim Mailversand angehängt
 * werden. Die Datei lädt der Browser direkt in den privaten Bucket
 * (Server-Actions sind auf 4 MB begrenzt); hier wird sie geprüft und
 * registriert. Entfernen = deaktivieren, damit alte Mails nachvollziehbar bleiben.
 */

const COLS = "id,name,storage_path,size_bytes,mime_type,active,created_at";

type Result<T = object> = ({ ok: true; error?: undefined } & T) | { ok?: undefined; error: string };

export async function listEmailAttachments(): Promise<EmailAttachment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_attachments")
    .select(COLS)
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as EmailAttachment[];
}

const registerSchema = z.object({
  path: z
    .string()
    .max(500)
    .regex(/^[0-9a-f-]{36}\/[^/]+\.pdf$/i, "Ungültiger Speicherpfad."),
  name: z.string().trim().min(1).max(200),
});

export async function registerEmailAttachment(input: {
  path: string;
  name: string;
}): Promise<Result<{ attachment: EmailAttachment }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const supabase = await createClient();
  const [folder, file] = parsed.data.path.split("/");

  // Datei muss wirklich im Bucket liegen; Größe und Typ von dort, nicht vom Client.
  const { data: objects, error: listError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .list(folder, { search: file, limit: 10 });
  const obj = objects?.find((o) => o.name === file);
  if (listError || !obj) return { error: "Die Datei wurde nicht gefunden. Bitte erneut hochladen." };
  const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
  const size = Number(meta.size ?? 0);
  if (meta.mimetype && meta.mimetype !== "application/pdf") {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([parsed.data.path]);
    return { error: "Nur PDF-Dateien sind erlaubt." };
  }
  if (!size || size > MAX_ATTACHMENT_BYTES) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([parsed.data.path]);
    return { error: "Die Datei ist leer oder größer als 10 MB." };
  }

  const { data, error } = await supabase
    .from("email_attachments")
    .insert({
      name: parsed.data.name,
      storage_path: parsed.data.path,
      size_bytes: size,
      mime_type: "application/pdf",
    })
    .select(COLS)
    .single();
  if (error || !data) return { error: "Das Dokument konnte nicht gespeichert werden." };
  revalidatePath("/vorlagen");
  return { ok: true, attachment: data as EmailAttachment };
}

export async function renameEmailAttachment(id: string, name: string): Promise<Result> {
  const parsedId = z.string().uuid().safeParse(id);
  const parsedName = z.string().trim().min(1).max(200).safeParse(name);
  if (!parsedId.success || !parsedName.success) return { error: "Ungültiger Name." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_attachments")
    .update({ name: parsedName.data })
    .eq("id", parsedId.data);
  if (error) return { error: "Umbenennen fehlgeschlagen." };
  revalidatePath("/vorlagen");
  return { ok: true };
}

/** Entfernt das Dokument aus der Auswahl (bleibt für alte Mails erhalten). */
export async function deactivateEmailAttachment(id: string): Promise<Result> {
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return { error: "Ungültiges Dokument." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_attachments")
    .update({ active: false })
    .eq("id", parsedId.data);
  if (error) return { error: "Entfernen fehlgeschlagen." };
  // Aus Standard-Anhängen der Vorlagen nehmen.
  const { data: tpls } = await supabase
    .from("email_templates")
    .select("id,attachment_ids")
    .contains("attachment_ids", [parsedId.data]);
  for (const t of tpls ?? []) {
    await supabase
      .from("email_templates")
      .update({ attachment_ids: (t.attachment_ids ?? []).filter((x) => x !== parsedId.data) })
      .eq("id", t.id);
  }
  revalidatePath("/vorlagen");
  return { ok: true };
}

/** Kurzlebiger Link zum Ansehen (privater Bucket). */
export async function attachmentPreviewUrl(id: string): Promise<Result<{ url: string }>> {
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return { error: "Ungültiges Dokument." };
  const supabase = await createClient();
  const { data: att } = await supabase
    .from("email_attachments")
    .select("storage_path")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (!att) return { error: "Dokument nicht gefunden." };
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(att.storage_path, 300);
  if (error || !data) return { error: "Vorschau nicht möglich." };
  return { ok: true, url: data.signedUrl };
}
