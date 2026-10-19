import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/sales/database";
import { getImapConfig } from "@/lib/sales/mail";

type SalesClient = SupabaseClient<Database, "sales">;

export type InboundSyncResult = {
  matched: number;
  quarantined: number;
  skipped: number;
  error?: string;
};

async function setImapMeta(
  supabase: SalesClient,
  patch: { last_sync_at?: string; last_error?: string | null },
) {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "imap_sync")
    .maybeSingle();
  const prev = (data?.value as Record<string, unknown>) ?? {};
  await supabase.from("app_settings").upsert({
    key: "imap_sync",
    value: { ...prev, ...patch },
    updated_at: new Date().toISOString(),
  });
}

export async function syncInboundEmail(
  supabase: SalesClient,
): Promise<InboundSyncResult> {
  const cfg = getImapConfig();
  if (!cfg) {
    return {
      matched: 0,
      quarantined: 0,
      skipped: 0,
      error: "IMAP nicht konfiguriert",
    };
  }

  let matched = 0;
  let quarantined = 0;
  let skipped = 0;

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(cfg.folder);
    try {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      for await (const msg of client.fetch(
        { seen: false, since },
        { source: true, envelope: true, uid: true },
      )) {
        const source = msg.source;
        if (!source) {
          skipped += 1;
          continue;
        }
        const parsed = await simpleParser(source);
        const messageId =
          parsed.messageId?.trim() ||
          `imap-${cfg.host}-${msg.uid}-${parsed.date?.toISOString() ?? Date.now()}`;
        const providerRef = messageId;
        const fromEmail =
          parsed.from?.value?.[0]?.address?.toLowerCase().trim() ?? null;
        const subject = parsed.subject ?? "(ohne Betreff)";
        const body =
          typeof parsed.text === "string"
            ? parsed.text.slice(0, 8000)
            : (parsed.html ?? "").toString().slice(0, 8000);

        const { data: existing } = await supabase
          .from("email_messages")
          .select("id")
          .eq("provider_ref", providerRef)
          .maybeSingle();
        if (existing) {
          skipped += 1;
          continue;
        }

        let companyId: string | null = null;
        let personId: string | null = null;
        if (fromEmail) {
          const { data: person } = await supabase
            .from("people")
            .select("id,company_id,email")
            .ilike("email", fromEmail)
            .limit(1)
            .maybeSingle();
          if (person) {
            companyId = person.company_id;
            personId = person.id;
          }
        }

        if (!companyId) {
          const { error: qErr } = await supabase
            .from("inbound_email_quarantine")
            .upsert(
              {
                provider_ref: providerRef,
                from_email: fromEmail,
                subject,
                body,
                received_at: (parsed.date ?? new Date()).toISOString(),
              },
              { onConflict: "provider_ref" },
            );
          if (!qErr) quarantined += 1;
          else skipped += 1;
          continue;
        }

        const { error: insertErr } = await supabase.from("email_messages").insert({
          company_id: companyId,
          person_id: personId,
          template_id: null,
          direction: "inbound",
          to_email: cfg.user,
          subject,
          body,
          status: "received",
          provider_ref: providerRef,
          error: null,
        });
        if (insertErr) {
          skipped += 1;
          continue;
        }

        await supabase.rpc("log_touch", {
          p_company_id: companyId,
          p_kanal: "email",
          p_ergebnis: "gespraech_ohne_termin",
          p_person_id: personId,
          p_notiz: `Eingehende E-Mail von ${fromEmail ?? "unbekannt"}: ${subject}\n\n${body.slice(0, 1500)}`,
          p_naechster: null,
          p_abbruch: null,
          p_source_key: `email:${providerRef}`,
        });
        // Antwort pausiert aktive Sequenzen (Close-Konvention).
        await supabase
          .from("sequence_enrollments")
          .update({ status: "pausiert" })
          .eq("company_id", companyId)
          .eq("status", "aktiv");
        matched += 1;
      }
    } finally {
      lock.release();
    }
    await client.logout();
    await setImapMeta(supabase, {
      last_sync_at: new Date().toISOString(),
      last_error: null,
    });
    return { matched, quarantined, skipped };
  } catch (e) {
    const message = e instanceof Error ? e.message : "IMAP-Sync fehlgeschlagen";
    try {
      await setImapMeta(supabase, {
        last_sync_at: new Date().toISOString(),
        last_error: message,
      });
    } catch {
      // ignore meta write failure
    }
    try {
      await client.logout();
    } catch {
      // ignore
    }
    return { matched, quarantined, skipped, error: message };
  }
}
