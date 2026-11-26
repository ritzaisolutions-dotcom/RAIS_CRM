"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Quelle der Wahrheit ist die `dark`-Klasse am <html>. Statt sie einmal beim
 * Mounten zu lesen (das konnte bei Client-Navigation den falschen Stand
 * erwischen), wird die Klasse beobachtet – Label und Icon passen immer.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

export function ThemeToggle({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* privates Fenster o. ä. — Wahl gilt dann nur für diese Sitzung */
    }
  }

  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Helles Design" : "Dunkles Design"}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg",
        collapsed && "justify-center px-0",
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {collapsed ? null : <span suppressHydrationWarning>{dark ? "Hell" : "Dunkel"}</span>}
    </button>
  );
}
