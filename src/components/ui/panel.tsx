import * as React from "react";
import { cn } from "@/lib/utils";

/** Fläche mit dünnem Rand — Grundbaustein wie Supabase-Cards. */
export function Panel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-line bg-surface", className)}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-line px-4 py-2.5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        {description ? (
          <p className="text-xs text-fg-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

/** Abschnittsüberschrift in Seitenleisten (Lead-Steckbrief). */
export function SectionLabel({
  className,
  children,
  action,
}: {
  className?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
        {children}
      </h3>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-1 flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-muted [&_svg]:size-4">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? (
        <p className="max-w-sm text-[13px] text-fg-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Kopfzeile einer Seite: Titel links, Aktionen rechts. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-2",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold text-fg">{title}</h1>
        {description ? (
          <p className="truncate text-xs text-fg-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
