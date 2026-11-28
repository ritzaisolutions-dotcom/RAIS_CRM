/**
 * Server-seitige Anbindung der KI-Anbieter. Keys nur aus Umgebungsvariablen,
 * nie im Client. Claude über das Anthropic-SDK; ChatGPT, Gemini, Grok und
 * Mistral über ihre OpenAI-kompatiblen Endpunkte (ein Client, andere baseURL).
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  AI_PROVIDERS,
  dropSnapshots,
  isChatModel,
  type AiModel,
  type AiProviderId,
  type AiProviderStatus,
  type ChatTurn,
} from "./catalog";

const BASE_URLS: Partial<Record<AiProviderId, string>> = {
  google: "https://generativelanguage.googleapis.com/v1beta/openai/",
  xai: "https://api.x.ai/v1",
  mistral: "https://api.mistral.ai/v1",
};

/**
 * Standardmodelle, falls die Modell-Liste des Anbieters nicht abrufbar ist.
 * Die echte Auswahl kommt live vom Anbieter.
 */
const FALLBACK_MODELS: Record<AiProviderId, string[]> = {
  anthropic: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  openai: ["gpt-5"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
  xai: ["grok-4"],
  mistral: ["mistral-large-latest", "mistral-medium-latest"],
};

/** Claude-Modelle, die serverseitige Refusal-Fallbacks („default“) unterstützen. */
const CLAUDE_FALLBACK_MODELS = new Set([
  "claude-fable-5-2",
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

export const SYSTEM_PROMPT =
  "Du bist der KI-Assistent im RAIS-CRM (Ritz AI Solutions, Vertrieb an Immobilienmakler). " +
  "Antworte auf Deutsch, klar und knapp, außer der Nutzer schreibt in einer anderen Sprache. " +
  "Hilf bei Vertrieb, Akquise, E-Mails, Einwandbehandlung und Recherche. " +
  "Wenn dir Informationen fehlen, sag das, statt etwas zu erfinden.";

function apiKey(provider: AiProviderId): string | undefined {
  const p = AI_PROVIDERS.find((x) => x.id === provider);
  for (const name of p?.envVars ?? []) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return undefined;
}

function openaiCompatible(provider: AiProviderId, key: string) {
  return new OpenAI({ apiKey: key, baseURL: BASE_URLS[provider], maxRetries: 1 });
}

function prettyLabel(provider: AiProviderId, id: string, displayName?: string | null): string {
  if (displayName) return displayName;
  if (provider === "google") return id.replace(/^models\//, "");
  return id;
}

/* ------------------------------------------------------------------ */
/* Modell-Listen (1 Stunde im Speicher)                                */
/* ------------------------------------------------------------------ */

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<AiProviderId, { at: number; models: AiModel[] }>();

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        t = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function fetchModels(provider: AiProviderId, key: string): Promise<AiModel[]> {
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: key, maxRetries: 1 });
    const out: AiModel[] = [];
    for await (const m of client.models.list({ limit: 100 })) {
      out.push({ provider, id: m.id, label: prettyLabel(provider, m.id, m.display_name) });
    }
    return out;
  }
  const client = openaiCompatible(provider, key);
  const created = new Map<string, number>();
  for await (const m of client.models.list()) created.set(m.id.replace(/^models\//, ""), Number(m.created) || 0);
  // Neueste zuerst (nach Erscheinungsdatum), sonst alphabetisch absteigend.
  const chat = dropSnapshots([...created.keys()].filter((id) => isChatModel(provider, id))).sort(
    (a, b) => (created.get(b) ?? 0) - (created.get(a) ?? 0) || b.localeCompare(a),
  );
  return chat.map((id) => ({ provider, id, label: prettyLabel(provider, id) }));
}

/** Alle Anbieter mit Status und Modellen. Ohne Key: leer, nicht konfiguriert. */
export async function listAiProviders(): Promise<AiProviderStatus[]> {
  return Promise.all(
    AI_PROVIDERS.map(async (p): Promise<AiProviderStatus> => {
      const key = apiKey(p.id);
      const base = { id: p.id, label: p.label, vendor: p.vendor, envVars: p.envVars };
      if (!key) return { ...base, configured: false, models: [], fallback: false };

      const hit = cache.get(p.id);
      if (hit && Date.now() - hit.at < CACHE_MS) return { ...base, configured: true, models: hit.models, fallback: false };

      try {
        const models = await withTimeout(fetchModels(p.id, key), 6000);
        if (models.length) {
          cache.set(p.id, { at: Date.now(), models });
          return { ...base, configured: true, models, fallback: false };
        }
      } catch {
        /* Liste nicht abrufbar → Standardmodelle */
      }
      return {
        ...base,
        configured: true,
        models: FALLBACK_MODELS[p.id].map((id) => ({ provider: p.id, id, label: id })),
        fallback: true,
      };
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Chat (Text-Stream)                                                  */
/* ------------------------------------------------------------------ */

export class AiNotConfiguredError extends Error {}

/**
 * Antwort als Strom von Text-Stücken. Wirft vor dem ersten Stück, wenn der
 * Anbieter nicht eingerichtet ist oder die Anfrage abgelehnt wird.
 */
export async function* streamChat(input: {
  provider: AiProviderId;
  model: string;
  messages: ChatTurn[];
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const key = apiKey(input.provider);
  if (!key) throw new AiNotConfiguredError(input.provider);

  if (input.provider === "anthropic") {
    const client = new Anthropic({ apiKey: key });
    const messages: Anthropic.Beta.BetaMessageParam[] = input.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const withFallback = CLAUDE_FALLBACK_MODELS.has(input.model);
    const stream = client.beta.messages.stream(
      {
        model: input.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages,
        ...(withFallback
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      },
      { signal: input.signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      yield "\n\n_(Claude hat diese Anfrage abgelehnt.)_";
    } else if (final.stop_reason === "max_tokens") {
      yield "\n\n_(Antwort wurde wegen Längenbegrenzung abgeschnitten.)_";
    }
    return;
  }

  const client = openaiCompatible(input.provider, key);
  const stream = await client.chat.completions.create(
    {
      model: input.model,
      stream: true,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...input.messages],
    },
    { signal: input.signal },
  );
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}
