/**
 * KI-Anbieter für den Chat — gemeinsam für Client und Server.
 * Keys liegen nur in der Server-Umgebung (siehe `providers.ts`).
 */

export const AI_PROVIDERS = [
  { id: "anthropic", label: "Claude", vendor: "Anthropic", envVars: ["ANTHROPIC_API_KEY"] },
  { id: "openai", label: "ChatGPT", vendor: "OpenAI", envVars: ["OPENAI_API_KEY"] },
  { id: "google", label: "Gemini", vendor: "Google", envVars: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"] },
  { id: "xai", label: "Grok", vendor: "xAI", envVars: ["XAI_API_KEY"] },
  { id: "mistral", label: "Mistral", vendor: "Mistral", envVars: ["MISTRAL_API_KEY"] },
] as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"];

export type AiModel = { provider: AiProviderId; id: string; label: string };

export type AiProviderStatus = {
  id: AiProviderId;
  label: string;
  vendor: string;
  envVars: readonly string[];
  configured: boolean;
  models: AiModel[];
  /** Modell-Liste kam nicht vom Anbieter (Fehler/Timeout) — nur Standardmodelle. */
  fallback: boolean;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Auswahl-Wert im Dropdown: „anthropic:claude-opus-5-5“. */
export function modelKey(m: Pick<AiModel, "provider" | "id">): string {
  return `${m.provider}:${m.id}`;
}

export function parseModelKey(key: string): { provider: AiProviderId; id: string } | null {
  const i = key.indexOf(":");
  if (i <= 0) return null;
  const provider = key.slice(0, i);
  const id = key.slice(i + 1).trim();
  if (!id || !AI_PROVIDERS.some((p) => p.id === provider)) return null;
  return { provider: provider as AiProviderId, id };
}

/**
 * Nur Chat-Modelle aus den Modell-Listen der Anbieter behalten
 * (keine Embeddings, Bild-, Audio-, Moderations- oder Such-Modelle).
 */
const NON_CHAT = /(embed|tts|whisper|transcri|dall-e|image|imagen|veo|moderation|audio|realtime|live|speech|ocr|search|computer-use|codex|aqa|learnlm|vision-preview|babbage|davinci|instruct)/i;

export function isChatModel(provider: AiProviderId, id: string): boolean {
  if (NON_CHAT.test(id)) return false;
  switch (provider) {
    case "openai":
      return /^(gpt-|o\d|chatgpt-)/i.test(id);
    case "google":
      return /gemini/i.test(id);
    case "xai":
      return /grok/i.test(id);
    case "anthropic":
      return id.startsWith("claude-");
    case "mistral":
      return true;
  }
}

/** Datums-Snapshots („gpt-4o-2024-08-06“) ausblenden, wenn es die Kurzform gibt. */
export function dropSnapshots(ids: string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    const base = id.replace(/-(\d{4}-\d{2}-\d{2}|\d{8}|\d{4})$/, "");
    return base === id || !set.has(base);
  });
}
