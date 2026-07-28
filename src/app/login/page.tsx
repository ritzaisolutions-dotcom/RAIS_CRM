import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
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
          <p className="muted">CRM · Anmelden</p>
        </div>
        <Suspense fallback={<p className="muted">Laden…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
