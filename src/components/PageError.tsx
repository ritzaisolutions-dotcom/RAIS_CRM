"use client";

import { useEffect, useState } from "react";
import { isStaleDeployError, reloadOnce } from "@/lib/appUpdate";

export function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Fehler aus einem veralteten Tab (unbekannte Server Action, fehlender
  // Chunk nach einem Deploy): einmal neu laden statt „Erneut versuchen“, das
  // mit dem alten JavaScript nie klappen würde.
  const stale = isStaleDeployError(error);
  const [reloadBlocked, setReloadBlocked] = useState(false);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    if (!stale) return;
    const t = window.setTimeout(() => {
      if (!reloadOnce()) setReloadBlocked(true);
    }, 800);
    return () => window.clearTimeout(t);
  }, [stale]);

  if (stale) {
    return (
      <div className="page-error stack" role="status" aria-live="polite">
        <p className="m-0">
          {reloadBlocked
            ? "Die App wurde aktualisiert."
            : "Die App wurde aktualisiert. Seite wird neu geladen …"}
        </p>
        {reloadBlocked ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Neu laden
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="page-error stack">
      <h1 className="m-0 font-[family-name:var(--font-source-serif)] text-xl">
        Etwas ist schiefgelaufen
      </h1>
      <p className="muted mb-0">
        Die Seite konnte nicht geladen werden. Bitte erneut versuchen.
      </p>
      <button type="button" className="btn btn-primary" onClick={reset}>
        Erneut versuchen
      </button>
    </div>
  );
}
