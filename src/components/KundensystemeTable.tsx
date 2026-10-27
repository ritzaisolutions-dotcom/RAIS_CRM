import Link from "next/link";
import { formatCheckedAgo } from "@/lib/sales/dates";
import {
  SYSTEM_STATUS_LABELS,
  type SystemStatus,
  type SystemStatusRow,
} from "@/lib/sales/types";

function statusTone(status: SystemStatus): "gruen" | "gelb" | "rot" | "grau" {
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

export function KundensystemeTable({ rows }: { rows: SystemStatusRow[] }) {
  const attention = rows.filter((r) => r.status !== "ok").length;

  return (
    <div className="stack">
      <header>
        <h1 className="m-0 font-[family-name:var(--font-source-serif)] text-2xl font-semibold">
          Kundensysteme
        </h1>
        <p className="muted mb-0 mt-1">
          {rows.length === 0
            ? "Noch kein System angelegt. Legen Sie das erste an."
            : attention === 0
              ? `${rows.length} Systeme · alle in Ordnung`
              : attention === 1
                ? "1 System braucht Ihre Aufmerksamkeit"
                : `${attention} Systeme brauchen Ihre Aufmerksamkeit`}
        </p>
      </header>

      <section className="dense-panel">
        {rows.length === 0 ? (
          <p className="muted mb-0">
            Noch kein System angelegt. Legen Sie das erste an.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Kunde</th>
                  <th>Art</th>
                  <th>Status</th>
                  <th>Letzte Prüfung</th>
                  <th>Was ich prüfen muss</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ago = formatCheckedAgo(row.last_checked_at);
                  return (
                    <tr key={row.code}>
                      <td>
                        <Link href={`/kundensysteme/${row.code}`}>
                          {row.code}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/kundensysteme/${row.code}`}>
                          {row.name}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/firma/${row.company_id}`}>
                          {row.company_name}
                        </Link>
                      </td>
                      <td>{row.kind}</td>
                      <td>
                        <span
                          className="badge-tone"
                          data-tone={statusTone(row.status)}
                        >
                          {SYSTEM_STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td>
                        <span
                          className={ago.stale ? "text-destructive" : undefined}
                        >
                          {ago.label}
                        </span>
                      </td>
                      <td className="muted">
                        {row.action?.trim() || "—"}
                      </td>
                      <td>
                        {row.project_url ? (
                          <a
                            href={row.project_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Öffnen
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
