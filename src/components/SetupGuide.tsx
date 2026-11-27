"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Check,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Mail,
  Monitor,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getConnectionStatus, testSmtpConnection } from "@/lib/sales/actions";
import { cn } from "@/lib/utils";

/**
 * „Einrichtung“: Anleitung für den Mailversand (SMTP auf Vercel) und die
 * Installation als Desktop-App. Passwörter werden hier nie eingegeben —
 * die liegen nur in den Vercel-Umgebungsvariablen.
 */

const VERCEL_ENV_URL =
  "https://vercel.com/ritzaisolutions-6158s-projects/rais-crm/settings/environment-variables";

type Provider = { name: string; host: string; port: string; note: string };
const PROVIDERS: Provider[] = [
  {
    name: "Google Workspace / Gmail",
    host: "smtp.gmail.com",
    port: "465",
    note: "Passwort = App-Passwort (Google-Konto → Sicherheit → 2-Faktor an → App-Passwörter)",
  },
  {
    name: "Microsoft 365 / Outlook",
    host: "smtp.office365.com",
    port: "587",
    note: "SMTP-Auth muss im Admin-Center für das Postfach erlaubt sein",
  },
  { name: "IONOS", host: "smtp.ionos.de", port: "465", note: "Normales Postfach-Passwort" },
  { name: "Strato", host: "smtp.strato.de", port: "465", note: "Normales Postfach-Passwort" },
];

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Chrome/Edge feuern das Event nur einmal, früh — global mitschneiden.
let deferredPrompt: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPrompt;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((l) => l());
  });
}

function useInstallState() {
  const [, force] = useState(0);
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: window-controls-overlay)").matches,
    );
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { canPrompt: !!deferredPrompt, standalone };
}

function CopyChip({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      title="Kopieren"
      className="inline-flex items-center gap-1 rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] hover:bg-surface-3"
    >
      {value}
      {done ? <Check className="size-3 text-[var(--tone-green-fg)]" /> : <Copy className="size-3 text-fg-subtle" />}
    </button>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-fg">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
    </li>
  );
}

export function SetupGuide({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("smtp");
  const [smtp, setSmtp] = useState<boolean | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const install = useInstallState();

  // Status einmal laden (für den Hinweis-Punkt) und beim Öffnen auffrischen.
  useEffect(() => {
    let alive = true;
    getConnectionStatus()
      .then((s) => alive && setSmtp(s.smtp))
      .catch(() => alive && setSmtp(null));
    return () => {
      alive = false;
    };
  }, [open]);

  const needsAttention = smtp === false || (!install.standalone && install.canPrompt);

  return (
    <>
      <button
        type="button"
        title="Einrichtung: E-Mail & Desktop-App"
        onClick={() => setOpen(true)}
        className={cn(
          "relative flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg",
          collapsed && "justify-center px-0",
        )}
      >
        <Wrench className="size-4 shrink-0" aria-hidden="true" />
        {collapsed ? null : <span className="flex-1 text-left">Einrichtung</span>}
        {needsAttention ? (
          <span
            className={cn("size-1.5 rounded-full bg-accent", collapsed && "absolute right-1.5 top-1.5")}
            aria-label="Offene Schritte"
          />
        ) : null}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Einrichtung"
          description="E-Mail-Versand verbinden und das CRM als Desktop-App installieren."
          className="max-w-2xl"
        >
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="-mx-5 -mt-4 mb-4 px-5">
              <TabsTrigger value="smtp">
                <Mail />
                E-Mail (SMTP)
                {smtp === false ? <span className="size-1.5 rounded-full bg-accent" /> : null}
              </TabsTrigger>
              <TabsTrigger value="desktop">
                <Monitor />
                Desktop-App
              </TabsTrigger>
            </TabsList>

            <TabsContent value="smtp" className="space-y-4 text-[13px]">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2",
                  smtp
                    ? "bg-[var(--tone-green-bg)] text-[var(--tone-green-fg)]"
                    : "bg-[var(--tone-yellow-bg)] text-[var(--tone-yellow-fg)]",
                )}
              >
                {smtp === null ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : smtp ? (
                  <Check className="size-4" />
                ) : (
                  <CircleAlert className="size-4" />
                )}
                {smtp === null
                  ? "Prüfe Status…"
                  : smtp
                    ? "E-Mail-Versand ist verbunden."
                    : "Noch nicht verbunden — Mails bleiben in der Warteschlange und gehen nicht raus."}
              </div>

              <ol className="space-y-4">
                <Step n={1}>
                  <p className="font-medium">Vercel-Einstellungen öffnen</p>
                  <a
                    href={VERCEL_ENV_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-accent-fg hover:underline"
                  >
                    rais-crm → Settings → Environment Variables <ExternalLink className="size-3" />
                  </a>
                </Step>
                <Step n={2}>
                  <p className="font-medium">Diese fünf Variablen anlegen (Environment: Production)</p>
                  <div className="overflow-hidden rounded-md border border-line">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-line">
                        {[
                          ["SMTP_HOST", "Server deines Anbieters, siehe unten"],
                          ["SMTP_PORT", "465 (SSL) oder 587 (STARTTLS)"],
                          ["SMTP_USER", "deine volle Mailadresse"],
                          ["SMTP_PASS", "Passwort bzw. App-Passwort — nur dort eintragen"],
                          ["SMTP_FROM", "Kevin Ritz <kevin@deine-domain.de>"],
                        ].map(([k, v]) => (
                          <tr key={k}>
                            <td className="w-36 px-2.5 py-1.5">
                              <CopyChip value={k} />
                            </td>
                            <td className="px-2.5 py-1.5 text-fg-muted">{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Step>
                <Step n={3}>
                  <p className="font-medium">Neu deployen</p>
                  <p className="text-fg-muted">
                    Vercel → Deployments → beim obersten Eintrag „…“ → <em>Redeploy</em>. Erst danach
                    kennt die App die neuen Werte.
                  </p>
                </Step>
                <Step n={4}>
                  <p className="font-medium">Testen</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || !smtp}
                      onClick={() =>
                        start(async () => {
                          const res = await testSmtpConnection();
                          setTestMsg(
                            res.error
                              ? { ok: false, text: res.error }
                              : { ok: true, text: res.ok ? res.message : "Gesendet." },
                          );
                        })
                      }
                    >
                      {pending ? <Loader2 className="animate-spin" /> : <Mail />}
                      Testmail an mich senden
                    </Button>
                    {!smtp ? <span className="text-xs text-fg-subtle">geht nach Schritt 3</span> : null}
                  </div>
                  {testMsg ? (
                    <p className={cn("text-xs", testMsg.ok ? "text-[var(--tone-green-fg)]" : "text-[var(--tone-red-fg)]")}>
                      {testMsg.text}
                    </p>
                  ) : null}
                </Step>
              </ol>

              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">Werte gängiger Anbieter</p>
                <div className="overflow-hidden rounded-md border border-line">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-2 text-left text-fg-muted">
                      <tr>
                        <th className="px-2.5 py-1.5 font-medium">Anbieter</th>
                        <th className="px-2.5 py-1.5 font-medium">SMTP_HOST</th>
                        <th className="px-2.5 py-1.5 font-medium">Port</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {PROVIDERS.map((p) => (
                        <tr key={p.name}>
                          <td className="px-2.5 py-1.5">
                            <div className="font-medium">{p.name}</div>
                            <div className="text-[11px] text-fg-subtle">{p.note}</div>
                          </td>
                          <td className="px-2.5 py-1.5">
                            <CopyChip value={p.host} />
                          </td>
                          <td className="px-2.5 py-1.5 tabular-nums">{p.port}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-fg-subtle">
                Passwörter gibst du nie hier im CRM ein, nur in Vercel. Optional für eingehende Mails:
                IMAP_HOST, IMAP_USER, IMAP_PASS.
              </p>
            </TabsContent>

            <TabsContent value="desktop" className="space-y-4 text-[13px]">
              {install.standalone ? (
                <div className="flex items-center gap-2 rounded-md bg-[var(--tone-green-bg)] px-3 py-2 text-[var(--tone-green-fg)]">
                  <Check className="size-4" /> Du nutzt das CRM bereits als Desktop-App.
                </div>
              ) : (
                <div className="rounded-lg border border-line bg-surface-2/50 p-4">
                  <p className="font-medium">RAIS CRM als App installieren</p>
                  <p className="mt-0.5 text-fg-muted">
                    Eigenes Fenster und Taskleisten-Symbol, startet direkt in „Leads“. Updates kommen
                    automatisch — nichts herunterzuladen oder zu aktualisieren.
                  </p>
                  <Button
                    className="mt-3"
                    size="sm"
                    disabled={!install.canPrompt}
                    onClick={async () => {
                      if (!deferredPrompt) return;
                      await deferredPrompt.prompt();
                      await deferredPrompt.userChoice;
                      deferredPrompt = null;
                      listeners.forEach((l) => l());
                    }}
                  >
                    <Download />
                    Jetzt installieren
                  </Button>
                  {!install.canPrompt ? (
                    <p className="mt-2 text-xs text-fg-subtle">
                      Dein Browser bietet die Installation hier nicht direkt an — dann so:
                    </p>
                  ) : null}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-line p-3">
                  <p className="font-medium">Chrome / Edge (Windows, Mac)</p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-fg-muted">
                    <li>crm.ritz-ai.solutions öffnen</li>
                    <li>In der Adressleiste rechts auf das Installieren-Symbol klicken</li>
                    <li>
                      oder Menü ⋮ → <em>Streamen, speichern und teilen</em> → <em>Seite als App installieren</em>
                    </li>
                  </ol>
                </div>
                <div className="rounded-md border border-line p-3">
                  <p className="font-medium">Safari (Mac)</p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-fg-muted">
                    <li>crm.ritz-ai.solutions öffnen</li>
                    <li>
                      Menü <em>Ablage</em> → <em>Zum Dock hinzufügen</em>
                    </li>
                  </ol>
                </div>
              </div>
              <p className="text-xs text-fg-subtle">
                Nach einem Update zeigt die App oben „Neue Version verfügbar“ und lädt beim nächsten
                Wechsel ins Fenster neu. Deinstallieren: in der App Menü ⋮ → <em>Deinstallieren</em>.
              </p>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
