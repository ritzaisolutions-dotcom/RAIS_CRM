"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Feld im Steckbrief: liest sich wie Text, wird per Klick editierbar.
 * Enter/Blur speichert, Esc verwirft.
 */
export function InlineField({
  label,
  value,
  display,
  placeholder = "Hinzufügen",
  type = "text",
  options,
  onSave,
}: {
  label: string;
  value: string | null;
  display?: React.ReactNode;
  placeholder?: string;
  type?: "text" | "number" | "tel" | "select";
  options?: { value: string; label: string }[];
  onSave: (next: string | null) => Promise<{ error?: string } | void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit(next = draft) {
    const v = next.trim();
    if (v === (value ?? "")) {
      setEditing(false);
      return;
    }
    start(async () => {
      const res = await onSave(v || null);
      if (res && res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setEditing(false);
    });
  }

  const fieldClass =
    "h-7 w-full rounded-md border border-accent bg-surface px-2 text-[13px] text-fg outline-none ring-[3px] ring-accent-soft";

  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2 py-1">
      <span className="pt-1 text-[13px] text-fg-muted">{label}</span>
      <div className="min-w-0">
        {editing ? (
          type === "select" ? (
            <select
              ref={ref}
              value={draft}
              disabled={pending}
              onChange={(e) => {
                setDraft(e.target.value);
                commit(e.target.value);
              }}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              className={fieldClass}
            >
              <option value="">—</option>
              {options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={ref}
              type={type}
              value={draft}
              disabled={pending}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
                if (e.key === "Escape") {
                  setDraft(value ?? "");
                  setEditing(false);
                }
              }}
              className={fieldClass}
            />
          )
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              "group flex min-h-7 w-full items-center justify-between gap-2 rounded-md px-2 -mx-2 text-left text-[13px] hover:bg-surface-2",
              !value && "text-fg-subtle",
            )}
          >
            <span className="min-w-0 truncate">
              {value ? (display ?? value) : placeholder}
            </span>
            <Pencil className="size-3 shrink-0 text-fg-subtle opacity-0 group-hover:opacity-100" />
          </button>
        )}
        {error ? (
          <p className="pt-0.5 text-xs text-[var(--tone-red-fg)]">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Zeile mit fester Beschriftung und beliebigem Inhalt (Status, Quelle …). */
export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2 py-1">
      <span className="text-[13px] text-fg-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
