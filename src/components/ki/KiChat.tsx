"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, KeyRound, RotateCcw, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { modelKey, type AiProviderStatus, type ChatTurn } from "@/lib/ai/catalog";
import { cn } from "@/lib/utils";

const MODEL_STORAGE = "ki:model";

type Msg = ChatTurn & { model?: string; error?: boolean };

export function KiChat({ providers }: { providers: AiProviderStatus[] }) {
  const configured = providers.filter((p) => p.configured && p.models.length > 0);
  const allKeys = useMemo(() => configured.flatMap((p) => p.models.map(modelKey)), [configured]);
  // Standard: Claude Opus 5.5, falls eingerichtet; sonst das erste verfügbare Modell.
  const [model, setModel] = useState<string>(
    allKeys.includes("anthropic:claude-opus-5-5") ? "anthropic:claude-opus-5-5" : (allKeys[0] ?? ""),
  );
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Zuletzt gewähltes Modell wiederherstellen, solange es noch verfügbar ist.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODEL_STORAGE);
      if (saved && allKeys.includes(saved)) setModel(saved);
    } catch {
      /* ignore */
    }
  }, [allKeys]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function chooseModel(v: string) {
    setModel(v);
    try {
      localStorage.setItem(MODEL_STORAGE, v);
    } catch {
      /* ignore */
    }
  }

  const modelLabel = (key: string) => {
    for (const p of providers) {
      const m = p.models.find((x) => modelKey(x) === key);
      if (m) return `${p.label} · ${m.label}`;
    }
    return key;
  };

  async function send() {
    const text = input.trim();
    if (!text || busy || !model) return;
    const history: Msg[] = [...messages.filter((m) => !m.error), { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "", model }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const update = (patch: Partial<Msg>) =>
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], ...patch };
        return next;
      });

    try {
      const res = await fetch("/api/ki/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: history.map(({ role, content }) => ({ role, content })) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `Fehler ${res.status}` }));
        update({ content: err.error ?? `Fehler ${res.status}`, error: true });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        update({ content: acc });
      }
      if (!acc.trim()) update({ content: "(Keine Antwort erhalten.)", error: true });
    } catch (e) {
      if ((e as Error).name !== "AbortError") update({ content: "Verbindung abgebrochen.", error: true });
    } finally {
      setBusy(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function reset() {
    stop();
    setMessages([]);
    inputRef.current?.focus();
  }

  if (configured.length === 0) {
    return <SetupHint providers={providers} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-5 py-2">
        <NativeSelect
          value={model}
          onChange={(e) => chooseModel(e.target.value)}
          aria-label="Modell wählen"
          className="w-auto min-w-64"
        >
          {configured.map((p) => (
            <optgroup key={p.id} label={`${p.label} (${p.vendor})`}>
              {p.models.map((m) => (
                <option key={modelKey(m)} value={modelKey(m)}>
                  {m.label}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
        <div className="flex flex-wrap gap-1">
          {providers.map((p) => (
            <span
              key={p.id}
              title={p.configured ? (p.fallback ? "Eingerichtet · Modell-Liste nicht abrufbar, Standardmodelle" : "Eingerichtet") : `Key fehlt: ${p.envVars[0]}`}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px]",
                p.configured ? "bg-[var(--tone-green-bg)] text-[var(--tone-green-fg)]" : "bg-surface-2 text-fg-subtle line-through",
              )}
            >
              {p.label}
            </span>
          ))}
        </div>
        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={reset} disabled={messages.length === 0}>
            <RotateCcw />
            Neuer Chat
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-muted">
                <Sparkles className="size-4" />
              </div>
              <p className="text-sm font-medium text-fg">Womit kann ich helfen?</p>
              <p className="max-w-sm text-[13px] text-fg-muted">
                Wähle oben ein Modell. Der Verlauf bleibt nur in diesem Fenster und wird nicht gespeichert.
              </p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed",
                    m.role === "user"
                      ? "whitespace-pre-wrap bg-accent-soft text-fg"
                      : m.error
                        ? "border border-[var(--tone-red-fg)]/30 bg-[var(--tone-red-bg)] text-[var(--tone-red-fg)]"
                        : "border border-line bg-surface text-fg",
                  )}
                >
                  {m.role === "assistant" && m.model ? (
                    <p className="mb-1 text-[11px] text-fg-subtle">{modelLabel(m.model)}</p>
                  ) : null}
                  {m.role === "assistant" && !m.content && busy && i === messages.length - 1 ? (
                    <span className="inline-flex gap-1 py-1">
                      <span className="size-1.5 animate-pulse rounded-full bg-fg-subtle" />
                      <span className="size-1.5 animate-pulse rounded-full bg-fg-subtle [animation-delay:150ms]" />
                      <span className="size-1.5 animate-pulse rounded-full bg-fg-subtle [animation-delay:300ms]" />
                    </span>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form
        className="border-t border-line bg-surface px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Nachricht schreiben … (Enter senden, Shift+Enter neue Zeile)"
            rows={2}
            className="min-h-12 flex-1 resize-none"
            autoFocus
          />
          {busy ? (
            <Button type="button" variant="secondary" size="icon" onClick={stop} aria-label="Antwort stoppen">
              <Square />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim() || !model} aria-label="Senden">
              <ArrowUp />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function SetupHint({ providers }: { providers: AiProviderStatus[] }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-14">
      <div className="flex items-center gap-2 text-fg">
        <KeyRound className="size-4" />
        <h2 className="text-sm font-semibold">Noch kein KI-Anbieter eingerichtet</h2>
      </div>
      <p className="text-[13px] text-fg-muted">
        Trage mindestens einen API-Key als Umgebungsvariable ein, lokal in <code>.env.local</code> und auf Vercel unter
        Settings → Environment Variables. Danach neu laden bzw. neu deployen.
      </p>
      <ul className="grid gap-1.5 text-[13px]">
        {providers.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2">
            <span>
              {p.label} <span className="text-fg-subtle">({p.vendor})</span>
            </span>
            <code className="text-xs text-fg-muted">{p.envVars[0]}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
