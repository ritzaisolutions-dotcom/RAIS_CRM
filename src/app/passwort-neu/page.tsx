import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { PasswordResetForm } from "@/components/PasswordResetForm";

export const dynamic = "force-dynamic";

export default function PasswortNeuPage() {
  return (
    <div className="login-wrap">
      <div className="login-panel stack">
        <div>
          <Image
            src="/rais_logo_with_text.svg"
            alt="RAIS — Ritz AI Solutions"
            width={220}
            height={58}
            className="mb-3 h-10 w-auto"
            priority
          />
          <p className="muted">CRM · Passwort</p>
        </div>
        <Suspense fallback={<p className="muted">Laden…</p>}>
          <PasswordResetForm />
        </Suspense>
        <p className="muted mb-0">
          <Link href="/login" className="hover:text-rais-orange">
            ← Zurück zur Anmeldung
          </Link>
        </p>
      </div>
    </div>
  );
}
