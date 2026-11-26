"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BellRing,
  CalendarDays,
  FileUp,
  LogOut,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Kbd } from "@/components/ui/badge";
import { TooltipProvider, Tooltip } from "@/components/ui/menu";
import { signOut } from "@/lib/sales/actions";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Users;
  badge?: number;
  /** Weitere Pfade, unter denen der Eintrag aktiv ist. */
  match?: string[];
};

const COLLAPSE_KEY = "rais-sidebar-collapsed";

/**
 * App-Rahmen im Supabase-Stil: schmale Seitenleiste in voller Höhe, Inhalt
 * ohne Rahmen-Deko. KPI-Karten, Banner und Aktivitäts-Spalte gibt es nicht
 * mehr — die alten Props werden nur noch angenommen, damit Bestandsseiten
 * weiter kompilieren.
 */
export function EfferdShell({
  children,
  todoBadge = 0,
  bare = false,
  degraded = false,
}: {
  children: React.ReactNode;
  /** @deprecated KPI-Karten entfallen im neuen Layout. */
  kpis?: { label: string; value: string; hint?: string }[];
  /** @deprecated Aktivitäts-Spalte entfällt im neuen Layout. */
  activity?: { title: string; when: string }[];
  /** @deprecated */
  focus?: boolean;
  degraded?: boolean;
  /** Fällige Wiedervorlagen (heute + überfällig). */
  todoBadge?: number;
  /** Seite bringt eigene Kopfzeile und Abstände mit (neue Seiten). */
  bare?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

  const nav: NavItem[] = [
    {
      href: "/leads",
      label: "Leads",
      icon: Users,
      match: ["/firma", "/liste", "/termine", "/kunden"],
    },
    {
      href: "/wiedervorlagen",
      label: "Wiedervorlagen",
      icon: BellRing,
      badge: todoBadge,
      match: ["/todos"],
    },
    { href: "/plan", label: "Plan", icon: CalendarDays },
    { href: "/import", label: "Import", icon: FileUp },
    { href: "/vorlagen", label: "E-Mail-Vorlagen", icon: Mail },
  ];

  function isActive(item: NavItem) {
    const paths = [item.href, ...(item.match ?? [])];
    return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }

  function NavLink({ item }: { item: NavItem }) {
    const Icon = item.icon;
    const active = isActive(item);
    const badge = item.badge ?? 0;
    const link = (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors",
          active
            ? "bg-surface-2 text-fg"
            : "text-fg-muted hover:bg-surface-2 hover:text-fg",
          collapsed && "justify-center px-0",
        )}
      >
        <Icon
          className={cn("size-4 shrink-0", active && "text-accent")}
          aria-hidden="true"
        />
        {collapsed ? null : <span className="flex-1 truncate">{item.label}</span>}
        {badge > 0 ? (
          <span
            className={cn(
              "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10.5px] font-semibold text-white",
              collapsed && "absolute -right-1 -top-1",
            )}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </Link>
    );
    return collapsed ? (
      <Tooltip content={item.label} side="right">
        {link}
      </Tooltip>
    ) : (
      link
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-dvh min-h-0 bg-bg text-fg">
        <a href="#main-content" className="skip-link">
          Zum Inhalt springen
        </a>

        <aside
          className={cn(
            "hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-150 md:flex",
            collapsed ? "w-14" : "w-56",
          )}
        >
          <div
            className={cn(
              "flex h-12 items-center gap-2 border-b border-line px-3",
              collapsed && "justify-center px-0",
            )}
          >
            <Link href="/leads" className="flex items-center gap-2" aria-label="RAIS CRM">
              <Image
                src="/rais-icon.svg"
                alt=""
                width={22}
                height={22}
                className="size-[22px]"
                priority
              />
              {collapsed ? null : (
                <span className="text-[13px] font-semibold tracking-tight">
                  RAIS <span className="font-normal text-fg-muted">CRM</span>
                </span>
              )}
            </Link>
          </div>

          <div className={cn("p-2", collapsed && "px-1.5")}>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("rais:open-search"))}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md border border-line bg-bg px-2 text-[13px] text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted",
                collapsed && "justify-center border-0 bg-transparent px-0",
              )}
              title="Suchen (Strg+K)"
            >
              <Search className="size-4 shrink-0" aria-hidden="true" />
              {collapsed ? null : (
                <>
                  <span className="flex-1 text-left">Suchen…</span>
                  <Kbd>Strg K</Kbd>
                </>
              )}
            </button>
          </div>

          <nav
            className={cn("flex flex-1 flex-col gap-0.5 px-2", collapsed && "px-1.5")}
            aria-label="Hauptnavigation"
          >
            {nav.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </nav>

          <div
            className={cn(
              "flex flex-col gap-0.5 border-t border-line p-2",
              collapsed && "px-1.5",
            )}
          >
            <NavLink
              item={{ href: "/einstellungen", label: "Einstellungen", icon: Settings }}
            />
            <ThemeToggle collapsed={collapsed} />
            <form action={signOut}>
              <button
                type="submit"
                title="Abmelden"
                className={cn(
                  "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg",
                  collapsed && "justify-center px-0",
                )}
              >
                <LogOut className="size-4 shrink-0" aria-hidden="true" />
                {collapsed ? null : <span>Abmelden</span>}
              </button>
            </form>
            <button
              type="button"
              onClick={toggleCollapsed}
              title={collapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
              className={cn(
                "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg",
                collapsed && "justify-center px-0",
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              ) : (
                <>
                  <PanelLeftClose className="size-4" aria-hidden="true" />
                  <span>Einklappen</span>
                </>
              )}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile: kompakte Leiste statt Seitenleiste */}
          <header className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-surface px-2 md:hidden">
            <Image src="/rais-icon.svg" alt="" width={20} height={20} className="mr-1" />
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
                    isActive(item) ? "bg-surface-2 text-fg" : "text-fg-muted",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className={cn(
              "min-h-0 flex-1 overflow-y-auto outline-none",
              !bare && "p-5",
            )}
          >
            {degraded ? (
              <div
                role="alert"
                className="mb-3 rounded-md bg-[var(--tone-red-bg)] px-3 py-2 text-[13px] text-[var(--tone-red-fg)]"
              >
                Einige Zahlen konnten nicht geladen werden.
              </div>
            ) : null}
            {bare ? children : <div className="mx-auto max-w-6xl space-y-3">{children}</div>}
          </main>
        </div>
        <GlobalSearch />
      </div>
    </TooltipProvider>
  );
}

/** Neuer Name — gleiche Komponente. */
export const AppShell = EfferdShell;
