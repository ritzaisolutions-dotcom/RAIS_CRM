import Image from "next/image";
import { signOut } from "@/lib/sales/actions";

export const dynamic = "force-dynamic";

export default function KeinZugriffPage() {
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
          <p className="muted">CRM · Kein Zugriff</p>
        </div>

        <div className="stack">
          <h1 className="m-0 font-[family-name:var(--font-source-serif)] text-xl">
            Dieser Account ist nicht freigeschaltet
          </h1>
          <p className="muted mb-0">
            Die Anmeldung hat funktioniert, aber der Account steht nicht auf der
            CRM-Freigabeliste. Ein Administrator muss ihn in{" "}
            <code>sales.app_users</code> eintragen.
          </p>
          <p className="muted mb-0">
            Falls du dich mit dem falschen Konto angemeldet hast, melde dich ab
            und versuche es erneut.
          </p>
          <form action={signOut}>
            <button className="btn btn-primary" type="submit">
              Abmelden
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
