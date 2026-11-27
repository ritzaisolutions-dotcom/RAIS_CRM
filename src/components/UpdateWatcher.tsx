"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ACTION_NOT_FOUND_HEADER,
  STALE_EVENT,
  isStaleDeployError,
  reloadOnce,
} from "@/lib/appUpdate";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const VERSION_URL = "/api/version";

type Status =
  /** Alles aktuell. */
  | "idle"
  /** Neue Version liegt bereit, Seite läuft noch mit der alten. */
  | "available"
  /** Ein Request ist am alten Stand gescheitert, Reload läuft. */
  | "reloading"
  /** Request gescheitert, aber Eingaben würden beim Reload verloren gehen. */
  | "stale-dirty";

const EDITABLE =
  'input:not([type=hidden]):not([type=file]):not([type=button]):not([type=submit]):not([type=reset]), textarea, select, [contenteditable=""], [contenteditable="true"]';

function snapshot(el: Element): string {
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    return String(el.checked);
  }
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return el.value;
  }
  return el.textContent ?? "";
}

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch(VERSION_URL, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) {
      return null;
    }
    const body = (await res.json()) as { id?: unknown };
    return typeof body.id === "string" && body.id ? body.id : null;
  } catch {
    return null;
  }
}

/**
 * Hält offene Tabs (und die installierte App) auf dem aktuellen Stand.
 *
 * - merkt sich beim Laden die Deployment-ID und prüft sie bei Fokus,
 *   Sichtbarkeitswechsel und alle 5 Minuten erneut;
 * - bei neuer ID: schmales Banner „Neue Version verfügbar“; ist kein Dialog
 *   offen und kein Feld fokussiert oder geändert, wird beim nächsten
 *   Fenster-Fokus automatisch neu geladen;
 * - scheitert ein Request am alten Stand (unbekannte Server Action, fehlender
 *   Chunk), wird einmal neu geladen — mit Sperre gegen Schleifen.
 */
export function UpdateWatcher() {
  const [status, setStatus] = useState<Status>("idle");
  const initialId = useRef<string | null>(null);
  const pending = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  /** Startwert jedes Feldes, das seit dem Laden fokussiert wurde. */
  const touched = useRef(new Map<Element, string>());

  const isSafeToReload = useCallback(() => {
    if (document.querySelector('[role="dialog"], [role="alertdialog"], dialog[open]')) {
      return false;
    }
    const active = document.activeElement;
    if (active && active !== document.body && active.matches(EDITABLE)) return false;
    for (const [el, initial] of touched.current) {
      if (!el.isConnected) {
        touched.current.delete(el);
        continue;
      }
      if (snapshot(el) !== initial) return false;
    }
    return true;
  }, []);

  /** Prüft die Version; `true`, wenn eine neue bereitliegt. */
  const check = useCallback(async () => {
    if (pending.current) return true;
    if (!inFlight.current) {
      inFlight.current = (async () => {
        const id = await fetchVersion();
        if (!id) return false;
        if (initialId.current === null) {
          initialId.current = id;
          return false;
        }
        if (id !== initialId.current) {
          pending.current = true;
          setStatus((s) => (s === "idle" ? "available" : s));
          return true;
        }
        return false;
      })().finally(() => {
        inFlight.current = null;
      });
    }
    return inFlight.current;
  }, []);

  const handleStale = useCallback(() => {
    pending.current = true;
    if (!isSafeToReload()) {
      setStatus("stale-dirty");
      return;
    }
    setStatus("reloading");
    window.setTimeout(() => {
      if (!reloadOnce()) setStatus("stale-dirty");
    }, 800);
  }, [isSafeToReload]);

  // Version beim Laden merken, dann Fokus/Sichtbarkeit/Intervall.
  useEffect(() => {
    void check();

    async function onFocusLike() {
      if (document.visibilityState !== "visible") return;
      const hasUpdate = await check();
      if (hasUpdate && isSafeToReload()) reloadOnce();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") void onFocusLike();
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, CHECK_INTERVAL_MS);

    window.addEventListener("focus", onFocusLike);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocusLike);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [check, isSafeToReload]);

  // Geänderte Felder erkennen: Startwert beim ersten Fokus merken.
  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const el = e.target;
      if (!(el instanceof Element) || !el.matches(EDITABLE)) return;
      if (!touched.current.has(el)) touched.current.set(el, snapshot(el));
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  // Requests, die am alten Stand scheitern, global abfangen.
  useEffect(() => {
    function onRejection(e: PromiseRejectionEvent) {
      if (isStaleDeployError(e.reason)) handleStale();
    }
    function onError(e: Event) {
      if (e instanceof ErrorEvent) {
        if (isStaleDeployError(e.error ?? e.message)) handleStale();
        return;
      }
      // Ladefehler von <script>/<link> aus /_next/static (Chunk weg).
      const t = e.target;
      const src =
        t instanceof HTMLScriptElement ? t.src : t instanceof HTMLLinkElement ? t.href : "";
      if (src.includes("/_next/static/")) handleStale();
    }
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError, true);
    window.addEventListener(STALE_EVENT, handleStale);

    // Next meldet eine unbekannte Server Action über einen Header. Viele
    // Aufrufer fangen den Fehler selbst ab — der Header kommt trotzdem an.
    const original = window.fetch;
    const wrapped: typeof window.fetch = async (...args) => {
      const res = await original(...args);
      if (res.headers.get(ACTION_NOT_FOUND_HEADER) === "1") handleStale();
      return res;
    };
    window.fetch = wrapped;

    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError, true);
      window.removeEventListener(STALE_EVENT, handleStale);
      if (window.fetch === wrapped) window.fetch = original;
    };
  }, [handleStale]);

  if (status === "idle") return null;

  const message =
    status === "reloading"
      ? "Die App wurde aktualisiert. Seite wird neu geladen …"
      : status === "stale-dirty"
        ? "Die App wurde aktualisiert. Die letzte Aktion wurde nicht ausgeführt — Eingaben sichern, dann neu laden."
        : "Neue Version verfügbar";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-accent-soft px-3 text-[13px] text-accent-fg"
    >
      <RefreshCw
        className={status === "reloading" ? "size-3.5 animate-spin" : "size-3.5"}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{message}</span>
      {status === "reloading" ? null : (
        <Button size="sm" onClick={() => window.location.reload()}>
          Jetzt laden
        </Button>
      )}
    </div>
  );
}
