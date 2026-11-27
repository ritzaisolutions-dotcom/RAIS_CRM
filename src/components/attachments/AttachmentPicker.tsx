"use client";

import Link from "next/link";
import { Check, FileText, Paperclip } from "lucide-react";
import {
  MAX_ATTACHMENTS_PER_EMAIL,
  type EmailAttachment,
} from "@/lib/sales/types";
import { cn } from "@/lib/utils";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Auswahl der hinterlegten PDF-Dokumente für eine Mail. */
export function AttachmentPicker({
  attachments,
  selected,
  onChange,
  compact = false,
}: {
  attachments: EmailAttachment[];
  selected: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  // Nur noch vorhandene Dokumente zählen (z. B. nach Entfernen aus der Bibliothek).
  const valid = selected.filter((id) => attachments.some((a) => a.id === id));
  const full = valid.length >= MAX_ATTACHMENTS_PER_EMAIL;

  if (attachments.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <Paperclip className="size-3.5" />
        Keine Dokumente hinterlegt.
        <Link href="/vorlagen#dokumente" className="text-accent-fg hover:underline">
          PDF hochladen
        </Link>
      </p>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", compact && "gap-1")}>
      <span className="mr-0.5 flex items-center gap-1 text-xs text-fg-muted">
        <Paperclip className="size-3.5" />
        Anhänge
      </span>
      {attachments.map((a) => {
        const on = valid.includes(a.id);
        return (
          <button
            key={a.id}
            type="button"
            aria-pressed={on}
            disabled={!on && full}
            onClick={() => onChange(on ? valid.filter((x) => x !== a.id) : [...valid, a.id])}
            title={`${a.name} · ${formatBytes(a.size_bytes)}`}
            className={cn(
              "flex h-7 max-w-[16rem] items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
              on
                ? "border-accent bg-accent-soft font-medium text-accent-fg"
                : "border-line-strong text-fg-muted hover:bg-surface-2 hover:text-fg",
              !on && full && "cursor-not-allowed opacity-50",
            )}
          >
            {on ? <Check className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
            <span className="truncate">{a.name}</span>
          </button>
        );
      })}
      {full ? (
        <span className="text-[11px] text-fg-subtle">max. {MAX_ATTACHMENTS_PER_EMAIL}</span>
      ) : null}
    </div>
  );
}

/** Kompakte Liste für Bestätigungs-Ansichten. */
export function AttachmentList({
  attachments,
  ids,
}: {
  attachments: EmailAttachment[];
  ids: string[];
}) {
  const items = ids
    .map((id) => attachments.find((a) => a.id === id))
    .filter((a): a is EmailAttachment => !!a);
  if (!items.length) return <span className="text-fg-subtle">keine</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((a) => (
        <span key={a.id} className="flex items-center gap-1">
          <FileText className="size-3.5 text-fg-muted" />
          {a.name}
          <span className="text-xs text-fg-subtle">({formatBytes(a.size_bytes)})</span>
        </span>
      ))}
    </span>
  );
}
