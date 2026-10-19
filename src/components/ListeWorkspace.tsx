"use client";

import { useEffect, useState } from "react";
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
      {desk !== "kunden" ? (
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
      ) : null}
      {desk === "dialen" ? <OpenTasksStrip tasks={tasks} /> : null}
      <p className="muted text-xs">
        Tastatur: j/k Zeile · Enter öffnen · c auswählen · Ctrl/Cmd+K Suche
        {desk === "dialen" ? " · Dialer im Menü" : ""}
      </p>
      <div className="form-actions wrap">
        <button
          type="button"
          className="btn"
          onClick={() => setSelected(rows.map((r) => r.company_id))}
        >
          Diese Seite für Bulk markieren
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
      <BulkPipelineBar
        selectedIds={selected}
        onClear={() => setSelected([])}
        sequences={sequences}
        desk={desk}
      />
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
    </div>
  );
}
