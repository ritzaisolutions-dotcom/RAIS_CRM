"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CallListeTable } from "@/components/CallListeTable";
import { LeadListsBar } from "@/components/LeadListsBar";
import {
  BulkPipelineBar,
  OpenTasksStrip,
  SavedViewsBar,
} from "@/components/ListeExtras";
import type { SavedViewWithCount } from "@/lib/sales/queries";
import type {
  CallListeRow,
  CustomFieldDef,
  CustomFieldValue,
  DialenQueue,
  LeadList,
  ListeDueFilter,
  ListeSort,
  PipelineStatus,
  SalesTask,
  Sequence,
} from "@/lib/sales/types";

export function ListeWorkspace({
  rows,
  title,
  subtitle,
  showCreate = false,
  initialStatus = "",
  initialDue = "",
  initialSort = "",
  initialQuery = "",
  initialListId = "",
  initialQueue = "",
  page,
  pageSize,
  total,
  hideStatusFilters = false,
  tasks,
  savedViews,
  leadLists = [],
  sequences = [],
  customDefs = [],
  customValues = [],
  desk = "dialen",
}: {
  rows: CallListeRow[];
  title: string;
  subtitle: string;
  showCreate?: boolean;
  initialStatus?: PipelineStatus | "";
  initialDue?: ListeDueFilter;
  initialSort?: ListeSort;
  initialQuery?: string;
  initialListId?: string;
  initialQueue?: DialenQueue;
  page: number;
  pageSize: number;
  total: number;
  hideStatusFilters?: boolean;
  tasks: SalesTask[];
  savedViews: SavedViewWithCount[];
  leadLists?: LeadList[];
  sequences?: Sequence[];
  customDefs?: CustomFieldDef[];
  customValues?: CustomFieldValue[];
  desk?: "dialen" | "termine" | "kunden";
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [focusIdx, setFocusIdx] = useState(0);
  const basePath =
    desk === "termine" ? "/termine" : desk === "kunden" ? "/kunden" : "/liste";

  const dialerHref = useMemo(() => {
    const params = new URLSearchParams();
    if (initialStatus) params.set("status", initialStatus);
    if (initialDue) params.set("due", initialDue);
    if (initialQuery) params.set("q", initialQuery);
    if (initialSort) params.set("sort", initialSort);
    if (initialListId) params.set("list", initialListId);
    if (initialQueue) params.set("queue", initialQueue);
    const qs = params.toString();
    return qs ? `/liste/dialen?${qs}` : "/liste/dialen";
  }, [
    initialDue,
    initialListId,
    initialQuery,
    initialQueue,
    initialSort,
    initialStatus,
  ]);

  const toolsOpenDefault =
    Boolean(initialListId) ||
    Boolean(initialQueue) ||
    savedViews.length > 0 ||
    leadLists.length > 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(rows.length - 1, i + 1));
        return;
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" && rows[focusIdx]) {
        e.preventDefault();
        router.push(`/firma/${rows[focusIdx].company_id}`);
        return;
      }
      if ((e.key === "c" || e.key === "C") && rows[focusIdx]) {
        e.preventDefault();
        const id = rows[focusIdx].company_id;
        setSelected((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusIdx, router, rows]);

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="stack liste-workspace">
      {desk === "dialen" ? (
        <div className="form-actions wrap items-center">
          <Link href={dialerHref} className="btn btn-primary">
            Jetzt abarbeiten
          </Link>
          <span className="muted text-xs">
            j/k Zeile · Enter öffnen · c auswählen · Ctrl/Cmd+K Suche
          </span>
        </div>
      ) : (
        <p className="muted text-xs mb-0">
          Tastatur: j/k Zeile · Enter öffnen · c auswählen · Ctrl/Cmd+K Suche
        </p>
      )}

      <CallListeTable
        rows={rows}
        title={title}
        subtitle={subtitle}
        showCreate={showCreate}
        initialStatus={initialStatus}
        initialDue={initialDue}
        initialSort={initialSort}
        initialQuery={initialQuery}
        page={page}
        pageSize={pageSize}
        total={total}
        hideStatusFilters={hideStatusFilters}
        customDefs={customDefs}
        customValues={customValues}
        selectedIds={selected}
        focusedId={rows[focusIdx]?.company_id ?? null}
        onToggleSelect={toggleSelect}
        pathnameOverride={basePath}
        desk={desk}
      />

      <BulkPipelineBar
        selectedIds={selected}
        onClear={() => setSelected([])}
        sequences={sequences}
        desk={desk}
      />

      {rows.length > 0 ? (
        <div className="form-actions wrap">
          <button
            type="button"
            className="btn"
            onClick={() => setSelected(rows.map((r) => r.company_id))}
          >
            Seite markieren
          </button>
          {selected.length > 0 ? (
            <button
              type="button"
              className="btn"
              onClick={() => setSelected([])}
            >
              Markierung aufheben
            </button>
          ) : null}
        </div>
      ) : null}

      {desk === "dialen" || desk === "termine" ? (
        <details className="dense-panel" open={toolsOpenDefault}>
          <summary className="cursor-pointer text-sm font-semibold">
            {desk === "dialen"
              ? "Warteschlangen, Listen & Ansichten"
              : "Listen"}
          </summary>
          <div className="stack mt-3">
            {desk === "dialen" ? (
              <SavedViewsBar
                views={savedViews}
                current={{
                  status: initialStatus,
                  due: initialDue,
                  q: initialQuery,
                  sort: initialSort,
                }}
              />
            ) : null}
            <LeadListsBar
              lists={leadLists}
              basePath={desk === "termine" ? "/termine" : "/liste"}
              currentListId={initialListId}
              currentQueue={initialQueue}
              selectedIds={selected}
              showQueues={desk === "dialen"}
              status={initialStatus}
              due={initialDue}
              q={initialQuery}
              sort={initialSort}
            />
            {desk === "dialen" && tasks.length > 0 ? (
              <OpenTasksStrip tasks={tasks} />
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
