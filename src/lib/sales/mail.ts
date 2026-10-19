import nodemailer from "nodemailer";

export type SmtpConfig = {
  host: string;
  user: string;
  pass: string;
  from: string;
  port: number;
  secure: boolean;
};

export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;
  if (!host || !user || !pass || !from) return null;
  const port = Number(process.env.SMTP_PORT || "587");
  const secure =
    process.env.SMTP_SECURE === "1" ||
    process.env.SMTP_SECURE === "true" ||
    port === 465;
  return { host, user, pass, from, port, secure };
}

export function smtpConfigured(): boolean {
  return getSmtpConfig() !== null;
}

export function getImapConfig(): {
  host: string;
  user: string;
  pass: string;
  port: number;
  secure: boolean;
  folder: string;
} | null {
  const host = process.env.IMAP_HOST?.trim();
  const user = process.env.IMAP_USER?.trim();
  const pass = process.env.IMAP_PASS?.trim();
  if (!host || !user || !pass) return null;
  const port = Number(process.env.IMAP_PORT || "993");
  const secure =
    process.env.IMAP_SECURE !== "0" && process.env.IMAP_SECURE !== "false";
  const folder = process.env.IMAP_FOLDER?.trim() || "INBOX";
  return { host, user, pass, port, secure, folder };
}

export function imapConfigured(): boolean {
  return getImapConfig() !== null;
}

export async function sendSmtpMail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const cfg = getSmtpConfig();
  if (!cfg) {
    return { ok: false, error: "SMTP nicht konfiguriert (SMTP_HOST/USER/PASS)." };
  }
  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    const info = await transport.sendMail({
      from: cfg.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return { ok: true, messageId: String(info.messageId ?? "") };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SMTP-Versand fehlgeschlagen";
    return { ok: false, error: msg };
  }
}
