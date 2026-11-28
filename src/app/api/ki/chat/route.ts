import { NextResponse, type NextRequest } from "next/server";
import { parseModelKey, type ChatTurn } from "@/lib/ai/catalog";
import { AiNotConfiguredError, streamChat } from "@/lib/ai/providers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_TURNS = 60;
const MAX_CHARS = 200_000;

/**
 * KI-Chat: nimmt den Verlauf + Modell entgegen und streamt die Antwort als
 * reinen Text zurück. Nur für angemeldete Nutzer; Keys bleiben auf dem Server.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  let body: { model?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const model = typeof body.model === "string" ? parseModelKey(body.model) : null;
  if (!model) return NextResponse.json({ error: "Kein gültiges Modell gewählt." }, { status: 400 });

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatTurn[] = raw
    .filter(
      (m): m is ChatTurn =>
        !!m &&
        typeof m === "object" &&
        ((m as ChatTurn).role === "user" || (m as ChatTurn).role === "assistant") &&
        typeof (m as ChatTurn).content === "string" &&
        (m as ChatTurn).content.trim() !== "",
    )
    .slice(-MAX_TURNS);
  if (messages.length === 0 || messages[0].role !== "user" || messages.at(-1)?.role !== "user") {
    return NextResponse.json({ error: "Der Verlauf muss mit einer Nachricht von dir enden." }, { status: 400 });
  }
  if (messages.reduce((n, m) => n + m.content.length, 0) > MAX_CHARS) {
    return NextResponse.json({ error: "Der Verlauf ist zu lang. Starte einen neuen Chat." }, { status: 413 });
  }

  const iterator = streamChat({ provider: model.provider, model: model.id, messages, signal: req.signal });

  // Erstes Stück abwarten, damit Fehler (Key, Modell, Limit) als richtige Antwort kommen.
  let first: IteratorResult<string>;
  try {
    first = await iterator.next();
  } catch (e) {
    return NextResponse.json({ error: describeError(e) }, { status: e instanceof AiNotConfiguredError ? 400 : 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done && first.value) controller.enqueue(encoder.encode(first.value));
        if (!first.done) {
          for await (const chunk of { [Symbol.asyncIterator]: () => iterator }) {
            controller.enqueue(encoder.encode(chunk));
          }
        }
      } catch (e) {
        if (!req.signal.aborted) controller.enqueue(encoder.encode(`\n\n_(Fehler: ${describeError(e)})_`));
      } finally {
        controller.close();
      }
    },
    async cancel() {
      await iterator.return?.(undefined);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function describeError(e: unknown): string {
  if (e instanceof AiNotConfiguredError) return "Für diesen Anbieter ist kein API-Key hinterlegt.";
  const err = e as { status?: number; code?: string; error?: { code?: string; type?: string } } | null;
  const status = err?.status;
  const code = err?.code ?? err?.error?.code ?? err?.error?.type;
  if (code === "insufficient_quota" || code === "billing_error")
    return "Kein Guthaben beim Anbieter. Bitte Abrechnung im Konto des Anbieters prüfen.";
  if (status === 401 || status === 403) return "Der API-Key wurde abgelehnt. Bitte prüfen.";
  if (status === 404) return "Dieses Modell gibt es beim Anbieter nicht (mehr).";
  if (status === 429) return "Limit beim Anbieter erreicht. Bitte kurz warten.";
  if (status && status >= 500) return "Der Anbieter ist gerade nicht erreichbar.";
  const msg = e instanceof Error ? e.message : String(e);
  return msg.slice(0, 300) || "Unbekannter Fehler.";
}
