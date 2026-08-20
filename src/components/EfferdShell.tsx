"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  LogOut,
  PhoneCall,
  Users,
} from "lucide-react";
import { signOut } from "@/lib/sales/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Kpi = {
  label: string;
  value: string;
  hint?: string;
};

export function EfferdShell({
  children,
  kpis = [],
  activity = [],
  focus = false,
  degraded = false,
}: {
  children: React.ReactNode;
  kpis?: Kpi[];
  activity?: { title: string; when: string }[];
  focus?: boolean;
  /** Mindestens eine KPI-Query ist fehlgeschlagen — Zahlen sind unvollständig. */
  degraded?: boolean;
}) {
  const pathname = usePathname();
  const nav = [
    { href: "/liste", label: "Prospects", icon: PhoneCall },
    { href: "/kunden", label: "Kunden", icon: Users },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-rais-cloud text-rais-charcoal">
      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 lg:grid-cols-[220px_1fr]">
        <aside className="border-b border-rais-border bg-rais-linen lg:border-b-0 lg:border-r">
          <div className="px-4 py-4">
            <Link href="/liste" className="block" aria-label="RAIS CRM">
              <Image
                src="/rais_logo_with_text.svg"
                alt="RAIS — Ritz AI Solutions"
                width={180}
                height={48}
                className="h-9 w-auto max-w-full"
                priority
              />
            </Link>
            <div className="mt-1 text-xs text-rais-stone">CRM · Kaltakquise</div>
          </div>
          <Separator />
          <nav className="flex gap-1 p-3 lg:flex-col">
            {nav.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href === "/liste" && pathname.startsWith("/firma"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-rais-stone transition-colors hover:bg-white hover:text-rais-charcoal",
                    active &&
                      "bg-white text-rais-charcoal shadow-[inset_0_0_0_1px_var(--rais-border)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto hidden p-3 lg:block">
            <form action={signOut}>
              <Button
                type="submit"
                variant="outline"
                className="w-full justify-start gap-2 border-rais-border bg-transparent"
              >
                <LogOut className="h-4 w-4" />
                Abmelden
              </Button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-rais-border bg-rais-linen/90 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2 text-sm text-rais-stone">
              <Building2 className="h-4 w-4 text-rais-orange" />
              {focus ? "Akquise-Steuerung" : "Workspace · Call Desk"}
            </div>
            <form action={signOut} className="lg:hidden">
              <Button type="submit" variant="outline" size="sm">
                Abmelden
              </Button>
            </form>
          </header>

          <div
            className={cn(
              "grid gap-3 p-4",
              !focus && "xl:grid-cols-[1fr_280px]",
            )}
          >
            <div className="min-w-0 space-y-3">
              {degraded ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                  Einige Kennzahlen konnten nicht geladen werden und sind als
                  „—“ markiert. Die Liste unten ist davon nicht betroffen.
                </div>
              ) : null}
              {!focus ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {kpis.map((kpi) => (
                    <div
                      key={kpi.label}
                      className="dense-panel px-3 py-3 shadow-sm"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-rais-stone">
                        {kpi.label}
                      </div>
                      <div className="mt-1 font-[family-name:var(--font-source-serif)] text-2xl font-semibold tabular-nums">
                        {kpi.value}
                      </div>
                      {kpi.hint ? (
                        <div className="mt-1 text-xs text-rais-sage">{kpi.hint}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {children}
            </div>

            {!focus ? (
            <aside className="space-y-3">
              <div className="dense-panel p-3">
                <div className="text-sm font-semibold">Pipeline-Status</div>
                <p className="mt-1 text-xs text-rais-stone">
                  Nichts Dringendes offen. Prospects und Kunden teilen sich denselben
                  Call-Desk.
                </p>
                <Link
                  href="/liste"
                  className="mt-3 inline-flex text-sm font-medium text-rais-orange hover:text-rais-orange-hover"
                >
                  Zur Prospect-Liste →
                </Link>
              </div>
              <div className="dense-panel p-3">
                <div className="text-sm font-semibold">Aktivität</div>
                <p className="mb-2 text-xs text-rais-stone">
                  Letzte Touchpoints im Workspace
                </p>
                <ul className="space-y-2">
                  {activity.length === 0 ? (
                    <li className="text-xs text-rais-stone">Noch keine Aktivität</li>
                  ) : (
                    activity.map((item, idx) => (
                      <li
                        key={`${item.title}-${idx}`}
                        className="border-b border-rais-border/70 pb-2 last:border-0 last:pb-0"
                      >
                        <div className="text-sm">{item.title}</div>
                        <div className="text-xs text-rais-stone">{item.when}</div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </aside>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
