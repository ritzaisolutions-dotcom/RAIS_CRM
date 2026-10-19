"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  runInboundEmailSyncAction,
  testSmtpConnection,
} from "@/lib/sales/actions";

export function ConnectionsPanel({
  status,
}: {
  status: {
    smtp: boolean;
    imap: boolean;
    cronSecret: boolean;
    serviceRole: boolean;
    imapLastSync: string | null;
    imapLastError: string | null;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="dense-panel">
      <h2 className="section-h">Verbindungen</h2>
      <p className="muted">
        Secrets liegen in der Server-Umgebung (Vercel / `.env`). Hier nur Status
        und Tests — keine Passwörter in der UI.
      </p>
      <ul className="task-list" style={{ marginTop: "0.75rem" }}>
        <li className="task-item">
          <div>
            <strong>SMTP (Outbound)</strong>
            <div className="muted">
              {status.smtp ? "Konfiguriert (SMTP_*)" : "Nicht konfiguriert"}
            </div>
          </div>
          <button
            type="button"
            className="btn"
            disabled={pending || !status.smtp}
            onClick={() =>
              start(async () => {
                const res = await testSmtpConnection();
                if (res.error) {
                  setErr(res.error);
                  setMsg(null);
                } else if (res.ok) {
                  setMsg(res.message);
                  setErr(null);
                }
              })
            }
          >
            Testmail senden
          </button>
        </li>
        <li className="task-item">
          <div>
            <strong>IMAP (Inbound)</strong>
            <div className="muted">
              {status.imap ? "Konfiguriert (IMAP_*)" : "Nicht konfiguriert"}
              {status.imapLastSync
                ? ` · letzter Sync ${new Date(status.imapLastSync).toLocaleString("de-DE")}`
                : ""}
              {status.imapLastError ? ` · Fehler: ${status.imapLastError}` : ""}
            </div>
          </div>
          <button
            type="button"
            className="btn"
            disabled={pending || !status.imap}
            onClick={() =>
              start(async () => {
                const res = await runInboundEmailSyncAction();
                if (res.error) {
                  setErr(res.error);
                  setMsg(null);
                } else if (res.ok) {
                  setMsg(
                    `Sync: ${res.matched} zugeordnet, ${res.quarantined} Quarantäne`,
                  );
                  setErr(null);
                  router.refresh();
                }
              })
            }
          >
            Jetzt synchronisieren
          </button>
        </li>
        <li className="task-item">
          <div>
            <strong>Cron</strong>
            <div className="muted">
              {status.cronSecret
                ? "CRON_SECRET gesetzt · /api/cron/sequences & /api/cron/inbound-email"
                : "CRON_SECRET fehlt"}
              {status.serviceRole
                ? " · Service-Role OK"
                : " · SUPABASE_SERVICE_ROLE_KEY fehlt (für Cron)"}
            </div>
          </div>
        </li>
      </ul>
      {msg ? <p className="muted">{msg}</p> : null}
      {err ? <p className="error">{err}</p> : null}
    </section>
  );
}
