"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useTransition } from "react";

/**
 * Gemeinsamer Übergang für Ansicht-, Filter- und Seitenwechsel der Leads-Liste:
 * Die Tabelle bleibt stehen und wird gedimmt, statt einzufrieren oder in den
 * Lade-Zustand zu springen.
 */
type LeadsNavCtx = {
  pending: boolean;
  navigate: (href: string, mode?: "push" | "replace") => void;
};

const Ctx = createContext<LeadsNavCtx | null>(null);

export function LeadsNavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const navigate = useCallback(
    (href: string, mode: "push" | "replace" = "push") => {
      start(() => {
        if (mode === "replace") router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [router],
  );
  return <Ctx.Provider value={{ pending, navigate }}>{children}</Ctx.Provider>;
}

/** Ohne Provider (z. B. in Tests) fällt die Navigation auf den Router zurück. */
export function useLeadsNav(): LeadsNavCtx {
  const ctx = useContext(Ctx);
  const router = useRouter();
  const [pending, start] = useTransition();
  if (ctx) return ctx;
  return {
    pending,
    navigate: (href, mode = "push") =>
      start(() => (mode === "replace" ? router.replace(href) : router.push(href))),
  };
}

/** Link auf eine Ansicht/Liste, der den gemeinsamen Übergang nutzt. */
export function LeadsNavLink({
  href,
  className,
  title,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const { navigate } = useLeadsNav();
  return (
    <Link
      href={href}
      className={className}
      title={title}
      onClick={(e) => {
        // Neuer Tab / Fenster normal öffnen lassen.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </Link>
  );
}
