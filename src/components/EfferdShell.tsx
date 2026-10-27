"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarCheck,
  CheckSquare,
  Headphones,
  LogOut,
  PhoneCall,
  Settings,
  Users,
} from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { signOut } from "@/lib/sales/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Kpi = {
  label: string;
  value: string;
  hint?: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof PhoneCall;
  badge?: number;
  title?: string;
  secondary?: boolean;
};

export function EfferdShell({
  children,
  kpis = [],
  activity = [],
  focus = false,
  degraded = false,
  todoBadge = 0,
}: {
  children: React.ReactNode;
  kpis?: Kpi[];
  activity?: { title: string; when: string }[];
  focus?: boolean;
  /** Mindestens eine KPI-Query ist fehlgeschlagen — Zahlen sind unvollständig. */
  degraded?: boolean;
  /** Offene Todos fällig heute oder überfällig. */
  todoBadge?: number;
}) {
  const pathname = usePathname();
  const primaryNav: NavItem[] = [
    { href: "/liste", label: "Dialen", icon: PhoneCall },
    { href: "/termine", label: "Termine", icon: CalendarCheck },
    { href: "/kunden", label: "Kunden", icon: Users },
    { href: "/kundensysteme", label: "Kundensysteme", icon: Activity },
  ];
  const toolNav: NavItem[] = [
    {
      href: "/liste/dialen",
      label: "Power-Dialer",
      icon: Headphones,
      title: "Session: nacheinander anrufen (aus der Dialen-Filterung)",
      secondary: true,
    },
    { href: "/todos", label: "Todos", icon: CheckSquare, badge: todoBadge },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/einstellungen", label: "Einstellungen", icon: Settings },
  ];

  const showAside = !focus && activity.length > 0;

  function navActive(item: NavItem) {
    if (item.href === "/liste") {
      return pathname === "/liste";
    }
    if (item.href === "/liste/dialen") {
      return pathname.startsWith("/liste/dialen");
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  function renderNav(items: NavItem[]) {
    return items.map((item) => {
      const Icon = item.icon;
      const active = navActive(item);
      const badge = item.badge ?? 0;
      return (
        <Link
          key={item.href}
          href={item.href}
          title={item.title}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-rais-stone transition-colors hover:bg-white hover:text-rais-charcoal",
            active &&
              "bg-white text-rais-charcoal shadow-[inset_0_0_0_1px_var(--rais-border)]",
            item.secondary && "text-xs",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1">{item.label}</span>
          {badge > 0 ? (
            <span className="todo-badge">{badge > 99 ? "99+" : badge}</span>
          ) : null}
        </Link>
      );
    });
  }

  return (
    <div className="min-h-screen bg-rais-cloud text-rais-charcoal">
      <a href="#main-content" className="skip-link">
        Zum Inhalt springen
      </a>
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
          <nav className="flex gap-1 p-3 lg:flex-col" aria-label="Hauptnavigation">
            {renderNav(primaryNav)}
            <Separator className="my-2 hidden lg:block" />
            <p className="mb-1 hidden px-3 text-[10px] font-semibold uppercase tracking-wide text-rais-stone lg:block">
              Werkzeuge
            </p>
            {renderNav(toolNav)}
          </nav>
          <div className="mt-auto hidden p-3 lg:block">
            <form action={signOut}>
              <Button
                type="submit"
                variant="outline"
                className="w-full justify-start gap-2 border-rais-border bg-transparent"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Abmelden
              </Button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-rais-border bg-rais-linen/90 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2 text-sm text-rais-stone">
              <Building2 className="h-4 w-4 text-rais-orange" aria-hidden="true" />
              {focus ? "Power-Dialer" : "Akquise-Arbeitsplatz"}
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
              showAside && "xl:grid-cols-[1fr_280px]",
            )}
          >
            <div id="main-content" className="min-w-0 space-y-3" tabIndex={-1}>
              {todoBadge > 0 ? (
                <div
                  role="status"
                  className="rounded-md border border-rais-orange/40 bg-rais-orange/10 px-3 py-2 text-sm"
                >
                  <Link
                    href="/todos"
                    className="font-medium text-rais-orange hover:underline"
                  >
                    {todoBadge} Todo{todoBadge === 1 ? "" : "s"} fällig heute
                    oder überfällig →
                  </Link>
                </div>
              ) : null}
              {degraded ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                  Einige Kennzahlen konnten nicht geladen werden und sind als
                  „—“ markiert. Die Liste unten ist davon nicht betroffen.
                </div>
              ) : null}
              {!focus && kpis.length > 0 ? (
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

            {showAside ? (
              <aside className="space-y-3" aria-label="Aktivität">
                <div className="dense-panel p-3">
                  <div className="text-sm font-semibold">Aktivität</div>
                  <p className="mb-2 text-xs text-rais-stone">
                    Letzte Touchpoints
                  </p>
                  <ul className="space-y-2">
                    {activity.map((item, idx) => (
                      <li
                        key={`${item.title}-${idx}`}
                        className="border-b border-rais-border/70 pb-2 last:border-0 last:pb-0"
                      >
                        <div className="text-sm">{item.title}</div>
                        <div className="text-xs text-rais-stone">{item.when}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            ) : null}
          </div>
        </div>
      </div>
      <GlobalSearch />
    </div>
  );
}
