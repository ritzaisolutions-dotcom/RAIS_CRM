"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Passwort zurücksetzen — zweistufig in einer Komponente.
 *
 * 1. "anfordern": E-Mail eingeben, Supabase schickt einen Recovery-Link.
 * 2. "setzen":    Der Link führt mit einer Recovery-Session hierher zurück,
 *                 dann wird das neue Passwort gesetzt.
 *
 * Vorher gab es gar keinen Weg: ein Setter mit vergessenem Passwort war
 * ausgesperrt und auf manuelle Hilfe angewiesen.
 */
export function PasswordResetForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"anfordern" | "setzen">("anfordern");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordWdh, setPasswordWdh] = useState("");
  const [pending, setPending] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nach dem Klick auf den Recovery-Link liegt eine Session vor; erst dann
  // darf das Formular ein neues Passwort annehmen.
  useEffect(() => {
    let active = true;
    try {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data }) => {
        if (active && data.session) setMode("setzen");
      });
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (active && event === "PASSWORD_RECOVERY") setMode("setzen");
      });
      return () => {
        active = false;
        sub.subscription.unsubscribe();
      };
    } catch {
      setError("Dienst derzeit nicht erreichbar.");
    }
    return () => {
      active = false;
    };
  }, []);

  async function anfordern(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/passwort-neu`,
      });
      // Bewusst immer dieselbe Rückmeldung: sonst liesse sich hier abfragen,
      // welche E-Mail-Adressen im CRM existieren.
      setInfo(
        "Falls ein Konto zu dieser Adresse existiert, ist eine E-Mail mit dem Link unterwegs.",
      );
    } catch {
      setError("Anfrage fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setPending(false);
    }
  }

  async function setzen(e: React.FormEvent) {
    e.preventDefault();
    if (password !== passwordWdh) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (password.length < 10) {
      setError("Mindestens 10 Zeichen.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError("Passwort konnte nicht gesetzt werden. Link ggf. abgelaufen.");
        return;
      }
      router.replace("/liste");
      router.refresh();
    } catch {
      setError("Dienst derzeit nicht erreichbar.");
    } finally {
      setPending(false);
    }
  }

  if (mode === "setzen") {
    return (
      <form className="stack" onSubmit={setzen}>
        <div className="field">
          <label htmlFor="pw">Neues Passwort</label>
          <input
            id="pw"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pw2">Wiederholen</label>
          <input
            id="pw2"
            type="password"
            autoComplete="new-password"
            required
            value={passwordWdh}
            onChange={(e) => setPasswordWdh(e.target.value)}
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Speichern…" : "Passwort setzen"}
        </button>
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={anfordern}>
      <div className="field">
        <label htmlFor="reset-email">E-Mail</label>
        <input
          id="reset-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="muted mb-0">{info}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Senden…" : "Link anfordern"}
      </button>
    </form>
  );
}
