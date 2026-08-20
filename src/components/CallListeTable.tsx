"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Columns3, Download, GripVertical, Pencil, Plus } from "lucide-react";
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
  ListeDueFilter,
  ListeSort,
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
import { businessToday } from "@/lib/sales/dates";
import { CreateCompanyModal } from "@/components/CreateCompanyModal";

const STORAGE_KEY = "rais_liste_columns_v1";

const SORT_OPTIONS: { id: ListeSort; label: string }[] = [
  { id: "", label: "Anruf-Priorität" },
  { id: "faellig", label: "Fälligkeit" },
  { id: "tage", label: "Tage seit Touch" },
  { id: "firma", label: "Firma A–Z" },
];

type ColumnPrefs = {
  order: ListeColumnId[];
  visible: ListeColumnId[];
};

type Feedback = { text: string; tone: "ok" | "error" } | null;

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
    const parsed = JSON.parse(raw) as Partial<ColumnPrefs>;
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.visible)) {
      return defaultPrefs();
    }

    const order = parsed.order.filter((c) => LISTE_COLUMN_CATALOG.includes(c));
    const visible = parsed.visible.filter((c) =>
      LISTE_COLUMN_CATALOG.includes(c),
    );
    // Neue Spalten aus dem Katalog ergänzen und standardmäßig einblenden.
    for (const c of LISTE_COLUMN_CATALOG) {
      if (!order.includes(c)) {
        order.push(c);
        if (!visible.includes(c)) visible.push(c);
      }
    }
    return { order, visible: visible.length ? visible : [...order] };
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
  initialSort = "",
  initialQuery = "",
  page,
  pageSize,
  total,
  hideStatusFilters = false,
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
}) {
  const [prefs, setPrefs] = useState<ColumnPrefs>(defaultPrefs);
  const [editMode, setEditMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState(initialQuery);
  const [dragId, setDragId] = useState<ListeColumnId | null>(null);
  const [navPending, startNav] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  /** Schreibt Filter/Sortierung/Seite in die URL — der Server filtert. */
  const pushParams = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      // Jede Filteränderung springt zurück auf Seite 1.
      if (!("page" in patch)) params.delete("page");
      const qs = params.toString();
      startNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
    },
    [pathname, router, searchParams],
  );

  // Freitextsuche entprellt an den Server geben.
  useEffect(() => {
    if (q === initialQuery) return;
    const timer = setTimeout(() => pushParams({ q }), 350);
    return () => clearTimeout(timer);
  }, [q, initialQuery, pushParams]);

  const displayCols = useMemo(
    () => prefs.order.filter((c) => prefs.visible.includes(c)),
    [prefs],
  );

  const status = initialStatus;
  const due = initialDue;
  const sort = initialSort;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(status || due || q);

  function persist(next: ColumnPrefs) {
    setPrefs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Speicher voll oder gesperrt — Spaltenwahl gilt dann nur für diese Sitzung.
    }
  }

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
    return businessToday(d);
  }

  return (
    <div className="dense-panel space-y-3 overflow-hidden p-3 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-source-serif)] text-xl font-semibold">
            {title}
          </h1>
          <p className="text-sm text-rais-stone">{subtitle}</p>
          {feedback ? (
            <p
              role="status"
              className={cn(
                "mt-1 text-xs",
                feedback.tone === "error"
                  ? "font-medium text-red-700"
                  : "text-rais-sage",
              )}
            >
              {feedback.text}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Suche Firma, Person, Tel…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-52"
          />
          {!hideStatusFilters ? (
            <>
              <select
                aria-label="Status filtern"
                value={status}
                onChange={(e) => pushParams({ status: e.target.value })}
                className="h-9 w-44 rounded-md border border-rais-border bg-white px-2 text-sm"
              >
                <option value="">Alle Status</option>
                {PIPELINE_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {PIPELINE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <select
                aria-label="Fälligkeit filtern"
                value={due}
                onChange={(e) => pushParams({ due: e.target.value })}
                className="h-9 w-40 rounded-md border border-rais-border bg-white px-2 text-sm"
              >
                <option value="">Alle Fälligkeiten</option>
                <option value="today">Heute fällig</option>
                <option value="overdue">Überfällig</option>
              </select>
            </>
          ) : null}
          <select
            aria-label="Sortierung"
            value={sort}
            onChange={(e) => pushParams({ sort: e.target.value })}
            className="h-9 w-48 rounded-md border border-rais-border bg-white px-2 text-sm"
            title="Standard ist die Anruf-Priorität der Liste: überfällig zuerst, dann nächster Touch, dann Anfragen/Woche."
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id || "prio"} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {hasFilters ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-rais-border"
              onClick={() => {
                setQ("");
                pushParams({ status: "", due: "", q: "" });
              }}
            >
              Filter löschen
            </Button>
          ) : null}
          <a
            href={`/api/export?${new URLSearchParams({
              ...(hideStatusFilters ? { view: "kunden" } : {}),
              ...(status ? { status } : {}),
              ...(due ? { due } : {}),
              ...(q ? { q } : {}),
            }).toString()}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rais-border bg-white px-3 text-sm font-medium hover:bg-rais-linen"
            title="Exportiert alle Treffer der aktuellen Filter, nicht nur diese Seite."
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </a>
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

      <div
        className={cn("overflow-x-auto", navPending && "opacity-60")}
        aria-busy={navPending}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {displayCols.map((col) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={displayCols.length || 1}
                  className="py-10 text-center text-rais-stone"
                >
                  Keine Einträge für diese Filter.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <ListeRow
                  key={row.company_id}
                  row={row}
                  displayCols={displayCols}
                  defaultNext={plus48h()}
                  onFeedback={setFeedback}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-xs text-rais-stone">
          Seite {page} von {totalPages} · {total}{" "}
          {total === 1 ? "Eintrag" : "Einträge"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-rais-border"
            disabled={page <= 1 || navPending}
            onClick={() => pushParams({ page: String(page - 1) })}
          >
            Zurück
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-rais-border"
            disabled={page >= totalPages || navPending}
            onClick={() => pushParams({ page: String(page + 1) })}
          >
            Weiter
          </Button>
        </div>
      </div>

      {showCreate ? (
        <CreateCompanyModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setFeedback({ text: "Firma angelegt", tone: "ok" });
            setCreateOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ListeRow({
  row,
  displayCols,
  defaultNext,
  onFeedback,
}: {
  row: CallListeRow;
  displayCols: ListeColumnId[];
  defaultNext: string;
  onFeedback: (f: Feedback) => void;
}) {
  // Eigene Transition pro Zeile: vorher hat ein einziges `useTransition` im
  // Tabellen-Root beim Speichern *alle* Zeilen gleichzeitig deaktiviert.
  const [pending, start] = useTransition();
  const router = useRouter();
  const [nextDate, setNextDate] = useState(row.naechster_touch ?? defaultNext);
  const [kanal, setKanal] = useState<"call" | "dm">("call");

  useEffect(() => {
    setNextDate(row.naechster_touch ?? defaultNext);
  }, [row.naechster_touch, defaultNext]);

  const dateDirty = (row.naechster_touch ?? defaultNext) !== nextDate;

  function onStatus(status: PipelineStatus) {
    start(async () => {
      const res = await setListPipelineStatus({
        companyId: row.company_id,
        pipelineStatus: status,
        kanal,
        naechsterTouch: nextDate || defaultNext,
      });
      if (res.error) {
        onFeedback({ text: res.error, tone: "error" });
        return;
      }
      const note =
        res.relationship === "Kunde"
          ? " · jetzt unter Kunden"
          : res.relationship === "Ausgeschlossen"
            ? " · aus Prospects entfernt"
            : "";
      onFeedback({
        text: `${row.firma}: Status gesetzt · nächster Touch ${res.naechster_touch}${note}`,
        tone: "ok",
      });
      router.refresh();
    });
  }

  function onCrm(crm: CrmSystem | null) {
    start(async () => {
      const res = await updateListFields(row.company_id, { crm_system: crm });
      if (res.error) {
        onFeedback({ text: res.error, tone: "error" });
        return;
      }
      onFeedback({ text: `${row.firma}: CRM gespeichert`, tone: "ok" });
      router.refresh();
    });
  }

  function onAnfragen(n: number | null) {
    start(async () => {
      const res = await updateListFields(row.company_id, {
        anfragen_pro_woche: n,
      });
      if (res.error) {
        onFeedback({ text: res.error, tone: "error" });
        return;
      }
      onFeedback({ text: `${row.firma}: Anfragen/W gespeichert`, tone: "ok" });
      router.refresh();
    });
  }

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
            dateDirty={dateDirty}
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
  dateDirty,
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
  dateDirty: boolean;
  kanal: "call" | "dm";
  setKanal: (v: "call" | "dm") => void;
  onStatus: (status: PipelineStatus) => void;
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
              if (!val || val === row.status) return;
              onStatus(val);
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
      // Das Datum ist Parameter der Status-Änderung, kein eigenständiges Feld:
      // `naechster_touch` hängt am jüngsten Touchpoint, ein Speichern ohne
      // Status-Änderung würde einen Touch schreiben und die KPIs verfälschen.
      // Deshalb hier ein sichtbarer "noch nicht gespeichert"-Zustand statt
      // stiller Verwerfung.
      return (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            className={cn(
              "h-8 rounded-md border bg-white px-2 text-xs",
              dateDirty
                ? "border-rais-orange ring-1 ring-rais-orange/40"
                : "border-rais-border",
            )}
            disabled={pending}
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            title="Gilt für die nächste Status-Änderung dieser Zeile."
          />
          {dateDirty ? (
            <span
              className="text-[10px] font-medium text-rais-orange"
              title="Wird mit der nächsten Status-Änderung gespeichert."
            >
              ungespeichert
            </span>
          ) : null}
        </div>
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
        <a
          href={`mailto:${row.email}`}
          className="text-rais-orange hover:underline"
        >
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
          className="text-rais-orange hover:underline"
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
          onChange={(e) => onCrm((e.target.value || null) as CrmSystem | null)}
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
