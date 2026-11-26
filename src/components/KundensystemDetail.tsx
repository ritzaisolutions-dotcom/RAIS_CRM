import Link from "next/link";
import { formatCheckedAgo } from "@/lib/sales/dates";
import {
  SYSTEM_STATUS_LABELS,
  type SystemCheck,
  type SystemCheckResult,
  type SystemStatus,
  type SystemStatusRow,
} from "@/lib/sales/types";

function statusTone(
  status: SystemStatus | SystemCheckResult,
): "gruen" | "gelb" | "rot" | "grau" {
  switch (status) {
    case "ok":
      return "gruen";
    case "warnung":
      return "gelb";
    case "fehler":
      return "rot";
    case "nicht_geprueft":
      return "grau";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function KundensystemDetail({
  system,
  checks,
}: {
  system: SystemStatusRow;
  checks: SystemCheck[];
}) {
  const ago = formatCheckedAgo(system.last_checked_at);

  return (
    <div className="stack">
      <header>
        <p className="muted mb-1 mt-0">
          <Link href="/kundensysteme">← Kundensysteme</Link>
        </p>
        <h1 className="m-0 font-[family-name:var(--font-source-serif)] text-2xl font-semibold">
          {system.code} · {system.name}
        </h1>
        <p className="muted mb-0 mt-1">
          <Link href={`/firma/${system.company_id}`}>
            {system.company_name}
          </Link>
          {" · "}
          {system.kind}
          {system.project_url ? (
            <>
              {" · "}
              <a
                href={system.project_url}
                target="_blank"
                rel="noreferrer"
              >
                Projekt öffnen
              </a>
            </>
          ) : null}
        </p>
      </header>

      <section className="dense-panel">
        <div className="form-actions wrap" style={{ gap: "1.5rem" }}>
          <div>
            <div className="muted text-xs">Status</div>
            <span
              className="badge-tone"
              data-tone={statusTone(system.status)}
            >
              {SYSTEM_STATUS_LABELS[system.status]}
            </span>
          </div>
          <div>
            <div className="muted text-xs">Letzte Prüfung</div>
            <span className={ago.stale ? "text-destructive" : undefined}>
              {ago.label}
              {system.last_checked_at
                ? ` (${formatCheckedAt(system.last_checked_at)})`
                : null}
            </span>
          </div>
          <div>
            <div className="muted text-xs">Was ich prüfen muss</div>
            <div>{system.action?.trim() || "—"}</div>
          </div>
        </div>
      </section>

      <section className="dense-panel">
        <h2 className="m-0 mb-3 text-base font-semibold">
          Prüfungen der letzten 7 Tage
        </h2>
        {checks.length === 0 ? (
          <p className="muted mb-0">
            Noch keine Prüfungen. Automatische Läufe starten in einer späteren
            Iteration.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Art</th>
                  <th>Ergebnis</th>
                  <th>Dauer</th>
                  <th>Meldung</th>
                  <th>Handlung</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((check) => (
                  <tr key={check.id}>
                    <td>{formatCheckedAt(check.checked_at)}</td>
                    <td>{check.check_kind}</td>
                    <td>
                      <span
                        className="badge-tone"
                        data-tone={statusTone(check.result)}
                      >
                        {check.result === "ok"
                          ? "In Ordnung"
                          : check.result === "warnung"
                            ? "Warnung"
                            : "Fehler"}
                      </span>
                    </td>
                    <td className="muted">
                      {check.duration_ms != null
                        ? `${check.duration_ms} ms`
                        : "—"}
                    </td>
                    <td className="muted">
                      {check.message?.trim() || "—"}
                    </td>
                    <td className="muted">
                      {check.action?.trim() || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
