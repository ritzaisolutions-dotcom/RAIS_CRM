"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchActivityAction } from "@/lib/sales/actions";
import type { GlobalSearchHit } from "@/lib/sales/queries";

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      start(async () => {
        const res = await searchActivityAction(q);
        if (res.ok) setHits(res.hits);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [open, q]);

  if (!open) return null;

  return (
    <div
      className="global-search-overlay"
      role="dialog"
      aria-label="Suche"
      onClick={() => setOpen(false)}
    >
      <div
        className="global-search-panel dense-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          className="w-full rounded-md border border-rais-border px-3 py-2 text-sm"
          placeholder="Firma, Person oder Notiz…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="muted mt-1 mb-2 text-xs">
          Ctrl/Cmd+K · Esc schließen{pending ? " · …" : ""}
        </p>
        <ul className="task-list">
          {hits.length === 0 && q.trim().length >= 2 ? (
            <li className="muted">Keine Treffer</li>
          ) : null}
          {hits.map((h) => (
            <li key={`${h.kind}-${h.id}`}>
              <button
                type="button"
                className="btn w-full justify-start text-left"
                onClick={() => {
                  setOpen(false);
                  router.push(`/firma/${h.companyId}`);
                }}
              >
                <span className="muted text-xs uppercase">{h.kind}</span>
                <strong className="ml-2">{h.title}</strong>
                <span className="muted ml-2 text-xs">{h.subtitle}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
