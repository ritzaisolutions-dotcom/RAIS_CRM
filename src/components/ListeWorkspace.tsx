"use client";

import { useState } from "react";
import { CallListeTable } from "@/components/CallListeTable";
import {
  BulkPipelineBar,
  ImportCompaniesPanel,
  ListeDialer,
  OpenTasksStrip,
  SavedViewsBar,
} from "@/components/ListeExtras";
import type {
  CallListeRow,
  ListeDueFilter,
  ListeSort,
  PipelineStatus,
  SalesTask,
  SavedView,
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
  page,
  pageSize,
  total,
  hideStatusFilters = false,
  tasks,
  savedViews,
}: {
  rows: CallListeRow[];
  title: string;
  subtitle: string;
  showCreate?: boolean;
  initialStatus?: PipelineStatus | "";
  initialDue?: ListeDueFilter;
  initialSort?: ListeSort;
  initialQuery?: string;
  page: number;
  pageSize: number;
  total: number;
  hideStatusFilters?: boolean;
  tasks: SalesTask[];
  savedViews: SavedView[];
}) {
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <div className="stack liste-workspace">
      <SavedViewsBar
        views={savedViews}
        current={{
          status: initialStatus,
          due: initialDue,
          q: initialQuery,
          sort: initialSort,
        }}
      />
      <OpenTasksStrip tasks={tasks} />
      <div className="liste-workspace-grid">
        <ListeDialer rows={rows} />
        <ImportCompaniesPanel />
      </div>
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
      />
    </div>
  );
}
