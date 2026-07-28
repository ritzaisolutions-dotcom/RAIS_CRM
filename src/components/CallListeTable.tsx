"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Columns3, GripVertical, Pencil, Plus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  setListPipelineStatus,
  updateListFields,
} from "@/lib/sales/actions";
import type {
  CallListeRow,
  CrmSystem,
  ListeColumnId,
  PipelineStatus,
} from "@/lib/sales/types";
import {
  CRM_OPTIONS,
  LISTE_COLUMN_CATALOG,
  OUTREACH_KANAL_LABELS,
  OUTREACH_KANAL_OPTIONS,
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUS_OPTIONS,
  pipelineTone,
} from "@/lib/sales/types";
import { CreateCompanyModal } from "@/components/CreateCompanyModal";

const STORAGE_KEY = "rais_liste_columns_v1";
export type ListeDueFilter = "" | "today" | "overdue";

type ColumnPrefs = {
  order: ListeColumnId[];
  visible: ListeColumnId[];
};

function defaultPrefs(): ColumnPrefs {
  return {
    order: [...LISTE_COLUMN_CATALOG],
    visible: [...LISTE_COLUMN_CATALOG],
  };
}

function loadPrefs(): ColumnPrefs {
  if (typeof window === "undefined") return defaultPrefs();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw) as ColumnPrefs;
    const order = parsed.order.filter((c) =>
      LISTE_COLUMN_CATALOG.includes(c),
    );
    for (const c of LISTE_COLUMN_CATALOG) {
      if (!order.includes(c)) order.push(c);
    }
    const visible = parsed.visible.filter((c) =>
      LISTE_COLUMN_CATALOG.includes(c),
    );
    for (const c of LISTE_COLUMN_CATALOG) {
      if (!order.includes(c)) order.push(c);
      if (!parsed.order.includes(c) && !visible.includes(c)) visible.push(c);
    }
    return { order, visible: visible.length ? visible : [...LISTE_COLUMN_CATALOG] };
  } catch {
    return defaultPrefs();
  }
}

function hrefWebsite(url: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export function CallListeTable({
  rows,
  title,
  subtitle,
  showCreate = false,
  initialStatus = "",
  initialDue = "",
}: {
  rows: CallListeRow[];
  title: string;
  subtitle: string;
  showCreate?: boolean;
  initialStatus?: PipelineStatus | "";
  initialDue?: ListeDueFilter;
}) {
  const [prefs, setPrefs] = useState<ColumnPrefs>(defaultPrefs);
  const [editMode, setEditMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<PipelineStatus | "">(
    initialStatus,
  );
  const [dueFilter, setDueFilter] = useState<ListeDueFilter>(initialDue);
  const [dragId, setDragId] = useState<ListeColumnId | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  function persist(next: ColumnPrefs) {
    setPrefs(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const displayCols = useMemo(
    () => prefs.order.filter((c) => prefs.visible.includes(c)),
    [prefs],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    return rows.filter((row) => {
      const statusLabel = row.status
        ? PIPELINE_STATUS_LABELS[row.status]
        : "";
      const hay = [
        row.firma,
        row.entscheider,
        row.tel,
        row.email,
        row.crm,
        row.status,
        statusLabel,
        row.website,
        row.linkedin_url,
        row.instagram_url,
        row.facebook_url,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchQ = !query || hay.includes(query);
      const matchStatus = !statusFilter || row.status === statusFilter;
      const matchDue =
        !dueFilter ||
        (dueFilter === "today" && row.naechster_touch === today) ||
        (dueFilter === "overdue" &&
          row.naechster_touch != null &&
          row.naechster_touch < today);
      return matchQ && matchStatus && matchDue;
    });
  }, [rows, q, statusFilter, dueFilter]);

  function toggleVisible(col: ListeColumnId) {
    const visible = prefs.visible.includes(col)
      ? prefs.visible.filter((c) => c !== col)
      : [...prefs.visible, col];
    persist({ ...prefs, visible });
  }

  function onDrop(target: ListeColumnId) {
    if (!dragId || dragId === target) return;
    const order = [...prefs.order];
    const from = order.indexOf(dragId);
    const to = order.indexOf(target);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, dragId);
    persist({ ...prefs, order });
    setDragId(null);
  }

  function plus48h() {
    const d = new Date(Date.now() + 48 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }

  return (
    <div className="dense-panel space-y-3 overflow-hidden p-3 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-source-serif)] text-xl font-semibold">
            {title}
          </h1>
          <p className="text-sm text-rais-stone">{subtitle}</p>
          {msg ? <p className="mt-1 text-xs text-rais-sage">{msg}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Suche Firma, Person, Tel…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-52"
          />
          <select
            aria-label="Status filtern"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as PipelineStatus | "")
            }
            className="h-9 w-44 rounded-md border border-rais-border bg-white px-2 text-sm"
          >
            <option value="">Alle Status</option>
            {PIPELINE_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {PIPELINE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <select
            aria-label="Fälligkeit filtern"
            value={dueFilter}
            onChange={(e) =>
              setDueFilter(e.target.value as ListeDueFilter)
            }
            className="h-9 w-40 rounded-md border border-rais-border bg-white px-2 text-sm"
          >
            <option value="">Alle Fälligkeiten</option>
            <option value="today">Heute fällig</option>
            <option value="overdue">Überfällig</option>
          </select>
          {statusFilter || dueFilter ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-rais-border"
              onClick={() => {
                setStatusFilter("");
                setDueFilter("");
              }}
            >
              Filter löschen
            </Button>
          ) : null}
          {showCreate ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Neu
            </Button>
          ) : null}
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            className="gap-1.5 border-rais-border"
            onClick={() => setEditMode((v) => !v)}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editMode ? "Fertig" : "Spalten bearbeiten"}
          </Button>
        </div>
      </div>

      {editMode ? (
        <div className="rounded-md border border-dashed border-rais-border bg-white/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-rais-charcoal">
            <Columns3 className="h-4 w-4 text-rais-orange" />
            Spalten ein-/ausblenden und per Drag sortieren
          </div>
          <ul className="space-y-1">
            {prefs.order.map((col) => (
              <li
                key={col}
                draggable
                onDragStart={() => setDragId(col)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(col)}
                className="flex items-center gap-2 rounded-md border border-rais-border bg-rais-linen px-2 py-1.5 text-sm"
              >
                <GripVertical className="h-4 w-4 text-rais-stone" />
                <label className="flex flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={prefs.visible.includes(col)}
                    onChange={() => toggleVisible(col)}
                  />
                  {col}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {displayCols.map((col) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={displayCols.length || 1}
                  className="py-10 text-center text-rais-stone"
                >
                  Keine Einträge für diese Filter.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <ListeRow
                  key={row.company_id}
                  row={row}
                  displayCols={displayCols}
                  pending={pending}
                  defaultNext={plus48h()}
                  onStatus={(status, kanal, next) =>
                    start(async () => {
                      const res = await setListPipelineStatus({
                        companyId: row.company_id,
                        pipelineStatus: status,
                        kanal,
                        naechsterTouch: next,
                      });
                      if (res.error) {
                        setMsg(res.error);
                        return;
                      }
                      const note =
                        res.relationship === "Kunde"
                          ? " · jetzt unter Kunden"
                          : res.relationship === "Ausgeschlossen"
                            ? " · aus Prospects entfernt"
                            : "";
                      setMsg(
                        `Status gesetzt · nächster Touch ${res.naechster_touch}${note}`,
                      );
                    })
                  }
                  onCrm={(crm) =>
                    start(async () => {
                      const res = await updateListFields(row.company_id, {
                        crm_system: crm,
                      });
                      setMsg(res.error ?? "CRM gespeichert");
                    })
                  }
                  onAnfragen={(n) =>
                    start(async () => {
                      const res = await updateListFields(row.company_id, {
                        anfragen_pro_woche: n,
                      });
                      setMsg(res.error ?? "Anfragen/W gespeichert");
                    })
                  }
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {showCreate ? (
        <CreateCompanyModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setMsg(`Firma angelegt`);
            setCreateOpen(false);
            void id;
          }}
        />
      ) : null}
    </div>
  );
}

function ListeRow({
  row,
  displayCols,
  pending,
  defaultNext,
  onStatus,
  onCrm,
  onAnfragen,
}: {
  row: CallListeRow;
  displayCols: ListeColumnId[];
  pending: boolean;
  defaultNext: string;
  onStatus: (
    status: PipelineStatus,
    kanal: "call" | "dm",
    next: string | null,
  ) => void;
  onCrm: (c: CrmSystem | null) => void;
  onAnfragen: (n: number | null) => void;
}) {
  const [nextDate, setNextDate] = useState(row.naechster_touch ?? defaultNext);
  const [kanal, setKanal] = useState<"call" | "dm">("call");

  return (
    <TableRow className="hover:bg-white/70">
      {displayCols.map((col) => (
        <TableCell key={col} className="whitespace-nowrap align-middle">
          <Cell
            col={col}
            row={row}
            pending={pending}
            nextDate={nextDate}
            setNextDate={setNextDate}
            defaultNext={defaultNext}
            kanal={kanal}
            setKanal={setKanal}
            onStatus={onStatus}
            onCrm={onCrm}
            onAnfragen={onAnfragen}
          />
        </TableCell>
      ))}
    </TableRow>
  );
}

function Cell({
  col,
  row,
  pending,
  nextDate,
  setNextDate,
  defaultNext,
  kanal,
  setKanal,
  onStatus,
  onCrm,
  onAnfragen,
}: {
  col: ListeColumnId;
  row: CallListeRow;
  pending: boolean;
  nextDate: string;
  setNextDate: (v: string) => void;
  defaultNext: string;
  kanal: "call" | "dm";
  setKanal: (v: "call" | "dm") => void;
  onStatus: (
    status: PipelineStatus,
    kanal: "call" | "dm",
    next: string | null,
  ) => void;
  onCrm: (c: CrmSystem | null) => void;
  onAnfragen: (n: number | null) => void;
}) {
  switch (col) {
    case "Firma":
      return (
        <Link
          href={`/firma/${row.company_id}`}
          className="font-medium hover:text-rais-orange"
        >
          {row.firma}
        </Link>
      );
    case "Entscheider":
      return <>{row.entscheider ?? "—"}</>;
    case "Status": {
      const tone = pipelineTone(row.status);
      return (
        <div className="flex min-w-[14rem] items-center gap-1.5">
          <select
            className="pipeline-select h-8 min-w-[9.5rem] rounded-md border border-rais-border px-2 text-xs font-semibold"
            data-tone={tone}
            disabled={pending}
            value={row.status ?? "neu"}
            onChange={(e) => {
              const val = e.target.value as PipelineStatus;
              if (!val) return;
              onStatus(val, kanal, nextDate || defaultNext);
            }}
          >
            {PIPELINE_STATUS_OPTIONS.map((o) => (
              <option key={o} value={o} data-tone={pipelineTone(o)}>
                {PIPELINE_STATUS_LABELS[o]}
              </option>
            ))}
          </select>
          <select
            className="h-8 rounded-md border border-rais-border bg-white px-1.5 text-xs"
            disabled={pending}
            value={kanal}
            title="Kanal für Status-Log (DM zählt in Analytics)"
            onChange={(e) => setKanal(e.target.value as "call" | "dm")}
          >
            {OUTREACH_KANAL_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {OUTREACH_KANAL_LABELS[o]}
              </option>
            ))}
          </select>
        </div>
      );
    }
    case "Nächster Touch":
      return (
        <input
          type="date"
          className="h-8 rounded-md border border-rais-border bg-white px-2 text-xs"
          disabled={pending}
          value={nextDate ?? ""}
          onChange={(e) => setNextDate(e.target.value || defaultNext)}
          title="Datum für Status-Änderung; sonst +48h ab jetzt"
        />
      );
    case "Tage":
      return <span className="tabular-nums">{row.tage_seit_touch ?? "—"}</span>;
    case "Tel":
      return row.tel ? (
        <a href={`tel:${row.tel}`} className="text-rais-orange hover:underline">
          {row.tel}
        </a>
      ) : (
        "—"
      );
    case "Email":
      return row.email ? (
        <a href={`mailto:${row.email}`} className="text-rais-orange hover:underline">
          {row.email}
        </a>
      ) : (
        "—"
      );
    case "Website": {
      const href = hrefWebsite(row.website);
      return href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("text-rais-orange hover:underline")}
        >
          {row.website}
        </a>
      ) : (
        "—"
      );
    }
    case "LinkedIn":
      return row.linkedin_url ? (
        <a
          href={row.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-rais-orange hover:underline"
        >
          Profil
        </a>
      ) : (
        "—"
      );
    case "Instagram": {
      const href = hrefWebsite(row.instagram_url);
      return href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-rais-orange hover:underline"
        >
          IG
        </a>
      ) : (
        "—"
      );
    }
    case "Facebook": {
      const href = hrefWebsite(row.facebook_url);
      return href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-rais-orange hover:underline"
        >
          FB
        </a>
      ) : (
        "—"
      );
    }
    case "CRM":
      return (
        <select
          className="h-8 min-w-[8rem] rounded-md border border-rais-border bg-white px-2 text-xs"
          disabled={pending}
          value={row.crm ?? ""}
          onChange={(e) =>
            onCrm((e.target.value || null) as CrmSystem | null)
          }
        >
          <option value="">—</option>
          {CRM_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "Anfragen/W":
      return (
        <input
          type="number"
          min={0}
          className="h-8 w-20 rounded-md border border-rais-border bg-white px-2 text-xs tabular-nums"
          disabled={pending}
          defaultValue={row["anfragen/woche"] ?? ""}
          onBlur={(e) => {
            const raw = e.target.value;
            const n = raw === "" ? null : Number(raw);
            if (n === row["anfragen/woche"]) return;
            onAnfragen(n);
          }}
        />
      );
    default: {
      const _exhaustive: never = col;
      return _exhaustive;
    }
  }
}
