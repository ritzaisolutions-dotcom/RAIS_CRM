"use client";

import { useEffect } from "react";

export function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
