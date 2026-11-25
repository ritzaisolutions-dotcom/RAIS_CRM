import * as React from "react";
import { cn } from "@/lib/utils";

export type Tone =
  | "gray"
  | "orange"
  | "yellow"
  | "green"
  | "red"
  | "blue"
  | "violet";

const TONE_CLASS: Record<Tone, string> = {
  gray: "bg-[var(--tone-gray-bg)] text-[var(--tone-gray-fg)]",
  orange: "bg-[var(--tone-orange-bg)] text-[var(--tone-orange-fg)]",
  yellow: "bg-[var(--tone-yellow-bg)] text-[var(--tone-yellow-fg)]",
  green: "bg-[var(--tone-green-bg)] text-[var(--tone-green-fg)]",
  red: "bg-[var(--tone-red-bg)] text-[var(--tone-red-fg)]",
  blue: "bg-[var(--tone-blue-bg)] text-[var(--tone-blue-fg)]",
  violet: "bg-[var(--tone-violet-bg)] text-[var(--tone-violet-fg)]",
};

const DOT_CLASS: Record<Tone, string> = {
  gray: "bg-[var(--tone-gray-fg)]",
  orange: "bg-[var(--tone-orange-fg)]",
  yellow: "bg-[var(--tone-yellow-fg)]",
  green: "bg-[var(--tone-green-fg)]",
  red: "bg-[var(--tone-red-fg)]",
  blue: "bg-[var(--tone-blue-fg)]",
  violet: "bg-[var(--tone-violet-fg)]",
};

export function Badge({
  tone = "gray",
  dot = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded px-1.5 text-[11.5px] font-medium",
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span className={cn("size-1.5 rounded-full", DOT_CLASS[tone])} />
      ) : null}
      {children}
    </span>
  );
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-2 px-1 font-sans text-[10.5px] font-medium text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}
