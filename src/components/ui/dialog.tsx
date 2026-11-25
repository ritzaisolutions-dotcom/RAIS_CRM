"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  side,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string;
  description?: React.ReactNode;
  /** `right` = Seitenpanel (Sheet) statt zentriertem Dialog. */
  side?: "right";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col border border-line bg-surface text-fg shadow-[var(--shadow-pop)] outline-none",
          side === "right"
            ? "inset-y-0 right-0 w-full max-w-md border-y-0 border-r-0"
            : "left-1/2 top-[12vh] max-h-[80vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-lg",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-sm font-semibold">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-xs text-fg-muted">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">
                {title}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="-mr-1 rounded-md p-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Schließen"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "-mx-5 -mb-4 mt-4 flex items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
