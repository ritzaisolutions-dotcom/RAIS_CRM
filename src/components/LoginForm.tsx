"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { safeInternalRedirect } from "@/lib/auth/redirect";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = safeInternalRedirect(search.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    // `createClient()` wirft, wenn die Supabase-Env-Variablen fehlen. Ohne
    // try/catch lief `setPending(false)` dann nie und der Button blieb dauerhaft
    // auf "Anmelden…" stehen — ohne jede Fehlermeldung.
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError("Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError(
        "Anmeldung derzeit nicht möglich. Bitte später erneut versuchen.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="email">E-Mail</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Passwort</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Anmelden…" : "Anmelden"}
      </button>
      <p className="muted mb-0">
        <Link href="/passwort-neu" className="hover:text-rais-orange">
          Passwort vergessen?
        </Link>
      </p>
    </form>
  );
}
