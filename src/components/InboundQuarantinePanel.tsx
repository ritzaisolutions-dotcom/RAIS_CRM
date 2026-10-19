"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveInboundQuarantine } from "@/lib/sales/actions";

export type QuarantineItem = {
  id: string;
  provider_ref: string;
  from_email: string | null;
  subject: string | null;
  body: string | null;
  received_at: string;
};

export function InboundQuarantinePanel({ items }: { items: QuarantineItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [companyId, setCompanyId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  if (!items.length) return null;

  return (
    <section className="dense-panel">
      <h2 className="section-h">Eingehende E-Mails zuordnen</h2>
      <p className="muted">
        Absender ohne Treffer in Personen — Firma-UUID eintragen zum Zuordnen.
      </p>
      <ul className="task-list">
        {items.map((item) => (
          <li key={item.id} className="task-item">
            <div>
              <strong>{item.from_email ?? "unbekannt"}</strong>
              <div className="muted">{item.subject}</div>
            </div>
            <div className="form-actions wrap">
              <input
                className="h-8 min-w-[14rem] rounded-md border border-rais-border bg-white px-2 text-xs"
                placeholder="company UUID"
                value={companyId[item.id] ?? ""}
                onChange={(e) =>
                  setCompanyId((m) => ({ ...m, [item.id]: e.target.value }))
                }
              />
              <button
                type="button"
                className="btn"
                disabled={pending || !(companyId[item.id] ?? "").trim()}
                onClick={() =>
                  start(async () => {
                    const res = await resolveInboundQuarantine({
                      quarantineId: item.id,
                      companyId: companyId[item.id].trim(),
                    });
                    if (res.error) setError(res.error);
                    else {
                      setError(null);
                      router.refresh();
                    }
                  })
                }
              >
                Zuordnen
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
