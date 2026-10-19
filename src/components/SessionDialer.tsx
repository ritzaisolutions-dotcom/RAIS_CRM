"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  insertTouchpoint,
  logClickToCall,
} from "@/lib/sales/actions";
import { placeCallHref } from "@/lib/sales/placeCall";
import {
  ERGEBNIS_LABELS,
  ERGEBNIS_OPTIONS,
  PIPELINE_STATUS_LABELS,
} from "@/lib/sales/types";
import type { CallListeRow, TouchErgebnis } from "@/lib/sales/types";

const DIAL_KEYS = ERGEBNIS_OPTIONS.filter((e) => e !== "kein_ergebnis");

export function SessionDialer({
  rows,
  truncated,
  backHref,
}: {
  rows: CallListeRow[];
  truncated: boolean;
  backHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const current = rows[index] ?? null;
  const withPhone = Boolean(current?.tel);

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i >= rows.length - 1) {
        setDoneMsg("Queue abgearbeitet.");
        return i;
      }
      return i + 1;
    });
  }, [rows.length]);

  const dial = useCallback(() => {
    if (!current?.tel) return;
    start(async () => {
      await logClickToCall({
        company_id: current.company_id,
        telefon: current.tel!,
      });
      window.location.href = placeCallHref(current.tel!);
      router.refresh();
    });
  }, [current, router]);

  const skip = useCallback(() => {
    setError(null);
    advance();
  }, [advance]);

  const dispose = useCallback(
    (ergebnis: TouchErgebnis) => {
      if (!current) return;
      start(async () => {
        const res = await insertTouchpoint({
          company_id: current.company_id,
          person_id: null,
          kanal: "call",
          ergebnis,
          notiz: `Dialer: ${ERGEBNIS_LABELS[ergebnis]}`,
          naechster_touch: null,
          abbruchgrund: null,
        });
        if (res.error) {
          setError(res.error);
          return;
        }
        setError(null);
        advance();
        router.refresh();
      });
    },
    [advance, current, router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") {
        router.push(backHref);
        return;
      }
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        dial();
        return;
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        skip();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= DIAL_KEYS.length) {
        e.preventDefault();
        dispose(DIAL_KEYS[n - 1]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [backHref, dial, dispose, router, skip]);

  if (!rows.length) {
    return (
      <section className="dense-panel">
        <h1 className="section-h">Session-Dialer</h1>
        <p className="muted">Keine Leads in dieser View.</p>
        <Link href={backHref} className="btn">
          Zurück zur Liste
        </Link>
      </section>
    );
  }

  if (doneMsg && index >= rows.length - 1 && !pending) {
    return (
      <section className="dense-panel">
        <h1 className="section-h">Session-Dialer</h1>
        <p>{doneMsg}</p>
        <Link href={backHref} className="btn btn-primary">
          Zurück zur Liste
        </Link>
      </section>
    );
  }

  return (
    <section className="dense-panel dialer-session">
      <div className="form-actions wrap" style={{ justifyContent: "space-between" }}>
        <h1 className="section-h" style={{ margin: 0 }}>
          Session-Dialer
        </h1>
        <Link href={backHref} className="btn">
          Esc · Beenden
        </Link>
      </div>
      <p className="muted">
        {index + 1} / {rows.length}
        {truncated ? " (gekürzt)" : ""} · Tasten: D Anrufen · S Skip · 1–
        {DIAL_KEYS.length} Ergebnis
      </p>

      {current ? (
        <>
          <h2 className="m-0 font-[family-name:var(--font-source-serif)] text-2xl">
            <Link href={`/firma/${current.company_id}`}>{current.firma}</Link>
          </h2>
          <p className="muted">
            {[
              current.entscheider,
              current.stadt,
              current.status
                ? PIPELINE_STATUS_LABELS[current.status]
                : null,
              current.naechster_touch
                ? `fällig ${current.naechster_touch}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mb-2">
            <strong>{current.tel ?? "Keine Nummer"}</strong>
            {current.email ? ` · ${current.email}` : ""}
          </p>

          <div className="form-actions wrap">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || !withPhone}
              onClick={dial}
            >
              Anrufen (D)
            </button>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={skip}
            >
              Überspringen (S)
            </button>
          </div>

          <div className="form-actions wrap" style={{ marginTop: "0.75rem" }}>
            {DIAL_KEYS.map((ergebnis, i) => (
              <button
                key={ergebnis}
                type="button"
                className="btn"
                disabled={pending}
                onClick={() => dispose(ergebnis)}
              >
                {i + 1} · {ERGEBNIS_LABELS[ergebnis]}
              </button>
            ))}
          </div>
          {error ? <p className="error">{error}</p> : null}
        </>
      ) : null}
    </section>
  );
}
