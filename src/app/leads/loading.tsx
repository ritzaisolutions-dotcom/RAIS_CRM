import { EfferdShell } from "@/components/EfferdShell";

/** Skelett der Leads-Liste: gleiche Aufteilung wie die Seite, damit nichts springt. */
const COLS = ["w-40", "w-20", "w-24", "w-16", "w-32", "w-20", "w-16", "w-20", "w-16", "w-24"];

function Bar({ className }: { className: string }) {
  return <div className={`h-3 animate-pulse rounded bg-surface-3 ${className}`} />;
}

export default function LeadsLoading() {
  return (
    <EfferdShell bare>
      <div className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Leads werden geladen">
        <div className="flex min-h-12 items-center border-b border-line bg-surface px-5 py-2">
          <div className="grid gap-1.5">
            <Bar className="h-4 w-28" />
            <Bar className="w-16" />
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="hidden w-52 shrink-0 flex-col gap-2 border-r border-line bg-surface px-4 py-4 lg:flex">
            <Bar className="mb-1 w-16" />
            {Array.from({ length: 13 }, (_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Bar className={i % 3 === 0 ? "w-24" : i % 3 === 1 ? "w-20" : "w-28"} />
                <Bar className="w-5" />
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2">
              <div className="h-8 w-full max-w-xs animate-pulse rounded-md bg-surface-2" />
              <div className="h-7 w-24 animate-pulse rounded-md bg-surface-2" />
              <div className="h-7 w-20 animate-pulse rounded-md bg-surface-2" />
              <div className="h-7 w-28 animate-pulse rounded-md bg-surface-2" />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <div className="flex h-9 items-center gap-6 border-b border-line bg-surface-2 pl-4 pr-3">
                <div className="size-4 rounded bg-surface-3" />
                {COLS.map((w, i) => (
                  <Bar key={i} className={`h-2.5 ${w} opacity-60`} />
                ))}
              </div>
              {Array.from({ length: 14 }, (_, r) => (
                <div
                  key={r}
                  className="flex h-11 items-center gap-6 border-b border-line bg-surface pl-4 pr-3"
                  style={{ opacity: 1 - r * 0.055 }}
                >
                  <div className="size-4 rounded border border-line" />
                  {COLS.map((w, i) => (
                    <Bar key={i} className={w} />
                  ))}
                </div>
              ))}
            </div>
            <div className="flex h-11 items-center justify-between border-t border-line bg-surface px-4">
              <Bar className="w-32" />
              <Bar className="w-40" />
            </div>
          </div>
        </div>
      </div>
    </EfferdShell>
  );
}
