"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Eye, FileText, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/menu";
import { formatBytes } from "@/components/attachments/AttachmentPicker";
import {
  attachmentPreviewUrl,
  deactivateEmailAttachment,
  registerEmailAttachment,
  renameEmailAttachment,
} from "@/lib/sales/attachmentActions";
import {
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  type EmailAttachment,
} from "@/lib/sales/types";
import { createClient } from "@/lib/supabase/client";

function storageName(file: string): string {
  const base = file
    .replace(/\.pdf$/i, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "dokument"}.pdf`;
}

/** Dokumente (PDF) hochladen und verwalten — erscheinen als Anhang in jeder Mail. */
export function DocumentLibrary({ attachments }: { attachments: EmailAttachment[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const supabase = createClient();
    for (const file of Array.from(files)) {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (!isPdf) {
        setError(`„${file.name}“ ist keine PDF.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`„${file.name}“ ist größer als 10 MB.`);
        continue;
      }
      setUploading(file.name);
      const path = `${crypto.randomUUID()}/${storageName(file.name)}`;
      const { error: upError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upError) {
        setError(`Upload fehlgeschlagen: ${upError.message}`);
        continue;
      }
      const res = await registerEmailAttachment({
        path,
        name: file.name.replace(/\.pdf$/i, "").trim() || "Dokument",
      });
      if (res.error) {
        setError(res.error);
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
      }
    }
    setUploading(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div id="dokumente" className="flex min-h-0 flex-col border-t border-line">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-fg-muted">
          {attachments.length} {attachments.length === 1 ? "Dokument" : "Dokumente"}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={!!uploading}
          onClick={() => input.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          PDF hochladen
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => upload(e.target.files)}
        />
      </div>
      {uploading ? (
        <p className="px-3 pb-1 text-xs text-fg-subtle">Lade „{uploading}“ hoch…</p>
      ) : null}
      {error ? <p className="px-3 pb-1 text-xs text-[var(--tone-red-fg)]">{error}</p> : null}
      <ul className="max-h-64 overflow-y-auto p-1.5 pt-0">
        {attachments.length === 0 && !uploading ? (
          <li className="px-2.5 py-2 text-xs text-fg-subtle">
            Broschüre, Preisliste & Co. einmal hochladen und beim Senden einer Mail anhängen.
          </li>
        ) : null}
        {attachments.map((a) => (
          <li
            key={a.id}
            className="group flex items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-surface-2/60"
          >
            <FileText className="size-4 shrink-0 text-[var(--tone-red-fg)]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px]">{a.name}</div>
              <div className="text-[11px] text-fg-subtle">{formatBytes(a.size_bytes)}</div>
            </div>
            <Tooltip content="Ansehen">
              <button
                type="button"
                aria-label={`${a.name} ansehen`}
                className="flex size-6 items-center justify-center rounded text-fg-muted hover:bg-surface-3 hover:text-fg"
                onClick={() =>
                  start(async () => {
                    const res = await attachmentPreviewUrl(a.id);
                    if (res.error) setError(res.error);
                    else if (res.ok) window.open(res.url, "_blank", "noopener,noreferrer");
                  })
                }
              >
                <Eye className="size-3.5" />
              </button>
            </Tooltip>
            <Tooltip content="Umbenennen">
              <button
                type="button"
                aria-label={`${a.name} umbenennen`}
                disabled={pending}
                className="flex size-6 items-center justify-center rounded text-fg-muted hover:bg-surface-3 hover:text-fg"
                onClick={() => {
                  const name = prompt("Name des Dokuments (so heißt der Anhang in der Mail)", a.name);
                  if (!name?.trim() || name.trim() === a.name) return;
                  start(async () => {
                    const res = await renameEmailAttachment(a.id, name.trim());
                    if (res.error) setError(res.error);
                    router.refresh();
                  });
                }}
              >
                <Pencil className="size-3.5" />
              </button>
            </Tooltip>
            <Tooltip content="Entfernen">
              <button
                type="button"
                aria-label={`${a.name} entfernen`}
                disabled={pending}
                className="flex size-6 items-center justify-center rounded text-fg-muted hover:bg-surface-3 hover:text-[var(--tone-red-fg)]"
                onClick={() => {
                  if (!confirm(`„${a.name}“ aus den Dokumenten entfernen? Bereits gesendete Mails bleiben unverändert.`)) return;
                  start(async () => {
                    const res = await deactivateEmailAttachment(a.id);
                    if (res.error) setError(res.error);
                    router.refresh();
                  });
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
    </div>
  );
}
