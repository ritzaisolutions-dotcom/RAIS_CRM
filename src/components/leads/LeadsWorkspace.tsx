"use client";

import { InviteFromList } from "@/components/lead/InviteDialog";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  Filter,
  ChevronLeft,
  ChevronRight,
  FileUp,
  ListFilter,
  Mail,
  Phone,
  Pencil,
  Search,
  Users,
  X,
} from "lucide-react";
import { Badge, Kbd } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Tooltip,
} from "@/components/ui/menu";
import { Checkbox } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/panel";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { useLeadsNav } from "@/components/leads/LeadsNav";
import {
  FollowUpPicker,
  QuelleText,
  CrmMenu,
  NotePopover,
  AddContactField,
  SocialIcons,
  StatusMenu,
} from "@/components/leads/LeadBits";
import { addCompaniesToList, bulkSetPipelineStatus } from "@/lib/sales/actions";
import { setWiedervorlage } from "@/lib/sales/leadActions";
import { businessToday } from "@/lib/sales/dates";
import {
  FOLLOW_UP_QUICK,
  KATEGORIEN,
  LEAD_SORTS,
  LEADS_PAGE_SIZES,
  displayKategorie,
  pageItems,
  kategorieTone,
  kontaktwegLabel,
  nichtErreichtCount,
  STATUS_MENU,
  relativePast,
  statusTone,
  type LeadSortKey,
} from "@/lib/sales/leads";
import {
  LEAD_QUELLEN,
  LEAD_QUELLE_LABELS,
  type LeadList,
  type LeadQuelle,
  type LeadRow,
  type PipelineStatus,
} from "@/lib/sales/types";
import {
  AP_FILTER,
  COLUMN_FILTER_PARAMS,
  CRM_FILTER,
  hasColumnFilters,
  ICP_FILTER,
  KONTAKTE_FILTER,
  LK_FILTER,
  STATUS_FILTER,
  WV_FILTER,
  type LeadColumnFilters,
} from "@/lib/sales/leadColumnFilters";
import { cn } from "@/lib/utils";

export function LeadsWorkspace({
  rows,
  total,
  page,
  pageSize,
  q,
  quelle,
  kategorie,
  columns,
  sort,
  lists,
  viewLabel,
}: {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  quelle: LeadQuelle | "";
  kategorie: "lead" | "kontakt" | "kunde" | "";
  columns: LeadColumnFilters;
  sort: LeadSortKey;
  lists: LeadList[];
  viewLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(-1);
  const [bulkPending, startBulk] = useTransition();
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { pending: navPending, navigate } = useLeadsNav();

  const hrefWith = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      if (next.get("page") === "1") next.delete("page");
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [params, pathname],
  );

  // Ansicht/Filter/Seite im Übergang wechseln: Tabelle dimmt statt einzufrieren.
  const setParam = useCallback(
    (patch: Record<string, string | null>) => navigate(hrefWith(patch), "replace"),
    [hrefWith, navigate],
  );

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const goToPage = useCallback(
    (p: number) => {
      const target = Math.min(Math.max(1, p), pages);
      if (target !== page) setParam({ page: String(target) });
    },
    [page, pages, setParam],
  );

  // Nächste Seite vorladen, damit „Weiter“ sofort da ist.
  const nextHref = page < pages ? hrefWith({ page: String(page + 1) }) : null;
  useEffect(() => {
    if (!nextHref) return;
    // "full" lädt auch die Daten der dynamischen Seite, nicht nur die Hülle.
    router.prefetch(nextHref, { kind: "full" } as unknown as Parameters<typeof router.prefetch>[1]);
  }, [nextHref, router]);

  // Suche mit kurzer Verzögerung in die URL schreiben.
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => setParam({ q: search.trim() || null }), 250);
    return () => clearTimeout(t);
  }, [search, q, setParam]);

  // Auswahl zurücksetzen, wenn sich die Zeilen ändern (Ansicht/Filter/Seite).
  const rowKey = rows.map((r) => r.company_id).join(",");
  useEffect(() => {
    setSelected(new Set());
    setCursor(-1);
  }, [rowKey]);

  // Tastatur: j/k bewegen, Enter öffnet, / fokussiert die Suche.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input,textarea,select,[contenteditable],[role=menu],[role=dialog]"))) return;
      // AltGr (Strg+Alt unter Windows) braucht man auf deutscher Tastatur für [ und ].
      if ((e.metaKey || e.ctrlKey || e.altKey) && !e.getModifierState("AltGraph")) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(rows.length - 1, c + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === "Enter" && cursor >= 0 && rows[cursor]) {
        router.push(`/firma/${rows[cursor].company_id}`);
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "x" && cursor >= 0 && rows[cursor]) {
        toggle(rows[cursor].company_id);
      } else if (e.key === "[") {
        e.preventDefault();
        goToPage(page - 1);
      } else if (e.key === "]") {
        e.preventDefault();
        goToPage(page + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (cursor < 0) return;
    document
      .querySelector(`[data-row-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && !allChecked;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const filtersActive = Boolean(q || quelle || kategorie || hasColumnFilters(columns));
  const sortLabel = useMemo(
    () => LEAD_SORTS.find((s) => s.key === sort)?.label ?? "Wiedervorlage",
    [sort],
  );

  const P = COLUMN_FILTER_PARAMS;
  const headers: {
    label: string;
    filter?: { param: string; value: string; options: readonly { key: string; label: string }[] };
  }[] = [
    { label: "Lead" },
    { label: "Status", filter: { param: P.status, value: columns.status ?? "", options: STATUS_FILTER } },
    { label: "Wiedervorlage", filter: { param: P.wv, value: columns.wv ?? "", options: WV_FILTER } },
    { label: "Kontakte · Kontaktweg", filter: { param: P.kontakte, value: columns.kontakte ?? "", options: KONTAKTE_FILTER } },
    { label: "Ansprechpartner", filter: { param: P.ap, value: columns.ap ?? "", options: AP_FILTER } },
    {
      label: "Quelle",
      filter: {
        param: "quelle",
        value: quelle,
        options: LEAD_QUELLEN.map((x) => ({ key: x, label: LEAD_QUELLE_LABELS[x] })),
      },
    },
    { label: "CRM", filter: { param: P.crm, value: columns.crm ?? "", options: CRM_FILTER } },
    { label: "Letzter Kontakt", filter: { param: P.lk, value: columns.lk ?? "", options: LK_FILTER } },
    { label: "Links" },
    { label: "" },
  ];

  function runBulk(label: string, fn: (ids: string[]) => Promise<number>) {
    const ids = [...selected];
    startBulk(async () => {
      const n = await fn(ids);
      setBulkMsg(`${label}: ${n} von ${ids.length} Leads`);
      setSelected(new Set());
      router.refresh();
      setTimeout(() => setBulkMsg(null), 4000);
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Werkzeugleiste */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Firma, Person, Stadt, E-Mail…"
            className="pl-8 pr-8"
            aria-label="Leads durchsuchen"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
              aria-label="Suche leeren"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <Kbd className="absolute right-2 top-1/2 -translate-y-1/2">/</Kbd>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={columns.icp ? "secondary" : "outline"} size="sm">
              <ListFilter />
              {columns.icp ? ICP_FILTER.find((o) => o.key === columns.icp)?.label : "ICP"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>ICP-Bewertung</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={columns.icp ?? ""}
              onValueChange={(v) => setParam({ [COLUMN_FILTER_PARAMS.icp]: v || null })}
            >
              <DropdownMenuRadioItem value="">Alle</DropdownMenuRadioItem>
              {ICP_FILTER.map((o) => (
                <DropdownMenuRadioItem key={o.key} value={o.key}>
                  {o.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={kategorie ? "secondary" : "outline"} size="sm">
              <ListFilter />
              {kategorie ? KATEGORIEN.find((k) => k.key === kategorie)?.label : "Kategorie"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Kategorie</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={kategorie} onValueChange={(v) => setParam({ kat: v || null })}>
              <DropdownMenuRadioItem value="">Alle</DropdownMenuRadioItem>
              {KATEGORIEN.map((k) => (
                <DropdownMenuRadioItem key={k.key} value={k.key}>
                  {k.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={quelle ? "secondary" : "outline"} size="sm">
              <ListFilter />
              {quelle ? LEAD_QUELLE_LABELS[quelle] : "Quelle"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Quelle</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={quelle}
              onValueChange={(v) => setParam({ quelle: v || null })}
            >
              <DropdownMenuRadioItem value="">Alle Quellen</DropdownMenuRadioItem>
              {LEAD_QUELLEN.map((x) => (
                <DropdownMenuRadioItem key={x} value={x}>
                  {LEAD_QUELLE_LABELS[x]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <ArrowUpDown />
              {sortLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Sortieren nach</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(v) => setParam({ sort: v || null })}
            >
              {LEAD_SORTS.map((s) => (
                <DropdownMenuRadioItem key={s.key} value={s.key}>
                  {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {filtersActive ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setParam({
                q: null,
                quelle: null,
                kat: null,
                ...Object.fromEntries(Object.values(COLUMN_FILTER_PARAMS).map((k) => [k, null])),
              });
            }}
          >
            Filter zurücksetzen
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/import">
              <FileUp />
              Import
            </Link>
          </Button>
          <CreateLeadDialog />
        </div>
      </div>

      {/* Tabelle */}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto transition-opacity duration-150",
          navPending && "pointer-events-none opacity-55 delay-75",
        )}
        aria-busy={navPending || undefined}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={filtersActive ? "Keine Treffer" : `Keine Leads in „${viewLabel}"`}
            description={
              filtersActive
                ? "Passe Suche oder Filter an."
                : "Lege einen Lead an oder importiere eine CSV-Liste."
            }
            action={
              filtersActive ? null : (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" asChild>
                    <Link href="/import">
                      <FileUp />
                      CSV importieren
                    </Link>
                  </Button>
                  <CreateLeadDialog />
                </div>
              )
            }
          />
        ) : (
          <table className="w-full min-w-[1320px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left">
                <th className="sticky top-0 z-10 w-10 border-b border-line bg-surface-2 py-0 pl-4 pr-1">
                  <Checkbox
                    aria-label="Alle auswählen"
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={(c) =>
                      setSelected(c ? new Set(rows.map((r) => r.company_id)) : new Set())
                    }
                  />
                </th>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className="sticky top-0 z-10 h-9 border-b border-line bg-surface-2 px-3 text-[11.5px] font-medium text-fg-muted"
                  >
                    {h.filter ? (
                      <ColumnFilter
                        label={h.label}
                        options={h.filter.options}
                        value={h.filter.value}
                        onChange={(v) => setParam({ [h.filter!.param]: v || null })}
                      />
                    ) : (
                      h.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const phone = r.tel || r.firma_telefon;
                const isSel = selected.has(r.company_id);
                return (
                  <tr
                    key={r.company_id}
                    data-row-index={i}
                    onClick={() => router.push(`/firma/${r.company_id}`)}
                    onMouseEnter={() => setCursor(i)}
                    className={cn(
                      "group h-11 cursor-pointer border-b border-line bg-surface transition-colors hover:bg-surface-2/70",
                      isSel && "bg-accent-soft/50 hover:bg-accent-soft/70",
                      cursor === i && "outline outline-1 -outline-offset-1 outline-accent/40",
                    )}
                  >
                    <td className="py-0 pl-4 pr-1" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={`${r.firma} auswählen`}
                        checked={isSel}
                        onCheckedChange={() => toggle(r.company_id)}
                      />
                    </td>
                    <td className="max-w-[260px] px-3 py-1">
                      <Link
                        href={`/firma/${r.company_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate font-medium text-fg hover:underline"
                      >
                        {r.firma}
                      </Link>
                      <div className="flex items-center gap-1.5 truncate text-xs text-fg-subtle">
                        {(() => {
                          const k = displayKategorie(r.kategorie, r.relationship);
                          return k === "lead" ? null : (
                            <Badge tone={kategorieTone(k)} className="h-4 px-1 text-[10px]">
                              {KATEGORIEN.find((x) => x.key === k)?.label}
                            </Badge>
                          );
                        })()}
                        <span className="truncate">{r.stadt ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-1">
                      <StatusMenu companyId={r.company_id} status={r.status} />
                    </td>
                    <td className="px-3 py-1">
                      <FollowUpPicker
                        companyId={r.company_id}
                        date={r.naechster_touch}
                        personId={r.person_id}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1 text-fg-muted">
                      {(() => {
                        const way = kontaktwegLabel(r.letzter_kontakt_kanal, r.vorheriger_kontakt_kanal);
                        // Anrufe aus der Notion-Zeit stehen nur im Status („Nicht erreicht 2“).
                        const kontakte = Math.max(r.kontaktversuche, nichtErreichtCount(r.status));
                        if (kontakte === 0 && !way) return <span className="text-fg-subtle">—</span>;
                        return (
                          <span className="flex items-center gap-1.5">
                            <span className="tabular-nums">{kontakte}×</span>
                            {way ? (
                              <span className={cn("text-xs", way.changed ? "font-medium text-accent-fg" : "text-fg-subtle")} title={way.changed ? "Kontaktweg hat gewechselt" : "Letzter Kontaktweg"}>
                                {way.label}
                              </span>
                            ) : null}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="max-w-[200px] px-3 py-1">
                      <div className="truncate text-fg">{r.entscheider ?? <span className="text-fg-subtle">—</span>}</div>
                      {r.email ? (
                        <div className="truncate text-xs text-fg-subtle">{r.email}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-1">
                      <QuelleText quelle={r.quelle} />
                    </td>
                    <td className="px-2 py-1">
                      <CrmMenu companyId={r.company_id} crm={r.crm} variant="inline" />
                    </td>
                    {/* Echte Kontakte (Anruf/E-Mail/DM/…), keine Status- oder Notiz-Einträge.
                        Relative Zeit weicht zwischen Server und Browser ab → Hydration-Warnung unterdrücken. */}
                    <td className="whitespace-nowrap px-3 py-1 text-fg-muted" suppressHydrationWarning>
                      {relativePast(r.letzter_kontakt_am)}
                    </td>
                    <td className="px-3 py-1">
                      <SocialIcons
                        links={{
                          website: r.website,
                          linkedin_url: r.linkedin_url,
                          xing_url: r.xing_url,
                          instagram_url: r.instagram_url,
                          facebook_url: r.facebook_url,
                          youtube_url: r.youtube_url,
                          tiktok_url: r.tiktok_url,
                        }}
                      />
                    </td>
                    <td className="w-36 px-3 py-1" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                      <div className="flex gap-0.5">
                        {phone ? (
                          <Tooltip content={phone}>
                            <a
                              href={`tel:${phone.replace(/\s+/g, "")}`}
                              className="flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-3 hover:text-fg"
                              aria-label={`${r.firma} anrufen`}
                            >
                              <Phone className="size-3.5" />
                            </a>
                          </Tooltip>
                        ) : (
                          <AddContactField companyId={r.company_id} personId={r.person_id} personName={r.entscheider} firma={r.firma} field="telefon" />
                        )}
                        {r.email ? (
                          <Tooltip content="E-Mail schreiben">
                            <Link
                              href={`/firma/${r.company_id}?tab=email`}
                              className="flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-3 hover:text-fg"
                              aria-label={`${r.firma} E-Mail schreiben`}
                            >
                              <Mail className="size-3.5" />
                            </Link>
                          </Tooltip>
                        ) : (
                          <AddContactField companyId={r.company_id} personId={r.person_id} personName={r.entscheider} firma={r.firma} field="email" />
                        )}
                        <InviteFromList companyId={r.company_id} firma={r.firma} />
                      </div>
                      {/* Alle Aktionen immer sichtbar; Notiz: schnell Kontext reinkopieren, ohne den Lead zu öffnen. */}
                      <NotePopover companyId={r.company_id} personId={r.person_id} firma={r.firma} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Fußzeile: Zähler + Seiten */}
      <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-4 py-2 text-xs text-fg-muted">
        <span>
          {total === 0 ? "0 Leads" : `${from}–${to} von ${total} Leads`}
          <span className="ml-3 hidden text-fg-subtle lg:inline">
            <Kbd>J</Kbd> <Kbd>K</Kbd> bewegen · <Kbd>↵</Kbd> öffnen · <Kbd>X</Kbd> auswählen · <Kbd>[</Kbd> <Kbd>]</Kbd> blättern
          </span>
        </span>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-fg-muted" aria-label="Leads pro Seite">
                {pageSize} pro Seite
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end">
              <DropdownMenuLabel>Leads pro Seite</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={String(pageSize)}
                onValueChange={(v) => setParam({ size: v === String(LEADS_PAGE_SIZES[0]) ? null : v })}
              >
                {LEADS_PAGE_SIZES.map((n) => (
                  <DropdownMenuRadioItem key={n} value={String(n)}>
                    {n}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {pages > 1 ? (
            <nav aria-label="Seiten" className="flex items-center gap-1">
              <Tooltip content="Vorherige Seite ( [ )">
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                  aria-label="Vorherige Seite"
                >
                  <ChevronLeft />
                </Button>
              </Tooltip>
              {pageItems(page, pages).map((it, i) =>
                it === "gap" ? (
                  <span key={`gap-${i}`} className="w-5 text-center text-fg-subtle" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <Button
                    key={it}
                    variant={it === page ? "secondary" : "ghost"}
                    size="sm"
                    className={cn("h-7 min-w-7 px-1.5 tabular-nums", it === page && "font-semibold text-fg")}
                    aria-current={it === page ? "page" : undefined}
                    aria-label={`Seite ${it}`}
                    onClick={() => goToPage(it)}
                  >
                    {it}
                  </Button>
                ),
              )}
              <Tooltip content="Nächste Seite ( ] )">
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={page >= pages}
                  onClick={() => goToPage(page + 1)}
                  aria-label="Nächste Seite"
                >
                  <ChevronRight />
                </Button>
              </Tooltip>
            </nav>
          ) : null}
        </div>
      </div>

      {/* Schwebende Aktionsleiste bei Auswahl */}
      {selected.size > 0 || bulkMsg ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 shadow-[var(--shadow-pop)]">
            {bulkMsg && selected.size === 0 ? (
              <span className="text-[13px]">{bulkMsg}</span>
            ) : (
              <>
                <span className="pr-1 text-[13px] font-medium tabular-nums">
                  {selected.size} ausgewählt
                </span>
                {selected.size === 1
                  ? (() => {
                      const id = [...selected][0];
                      const row = rows.find((r) => r.company_id === id);
                      return (
                        <>
                          <Button variant="secondary" size="sm" asChild>
                            <Link href={`/firma/${id}`}>
                              <Pencil />
                              Bearbeiten
                            </Link>
                          </Button>
                          <InviteFromList companyId={id} firma={row?.firma ?? "Lead"} variant="button" />
                        </>
                      );
                    })()
                  : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm" disabled={bulkPending}>
                      Status
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top">
                    {STATUS_MENU.map((s) => (
                      <DropdownMenuItem
                        key={s.value}
                        onSelect={() =>
                          runBulk(`Status „${s.label}"`, async (ids) => {
                            const res = await bulkSetPipelineStatus({
                              companyIds: ids,
                              pipelineStatus: s.value as PipelineStatus,
                              kanal: "status_change",
                            });
                            return res.ok ? res.updated : 0;
                          })
                        }
                      >
                        <Badge tone={statusTone(s.value)} dot className="bg-transparent px-0">
                          {s.label}
                        </Badge>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm" disabled={bulkPending}>
                      Wiedervorlage
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top">
                    {FOLLOW_UP_QUICK.map((p) => (
                      <DropdownMenuItem
                        key={p.key}
                        onSelect={() =>
                          runBulk(`Wiedervorlage ${p.label}`, async (ids) => {
                            const due = p.due(businessToday());
                            let n = 0;
                            for (const id of ids) {
                              const res = await setWiedervorlage({ companyId: id, date: due });
                              if (res.ok) n += 1;
                            }
                            return n;
                          })
                        }
                      >
                        {p.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {lists.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary" size="sm" disabled={bulkPending}>
                        Zu Liste
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top">
                      {lists.map((l) => (
                        <DropdownMenuItem
                          key={l.id}
                          onSelect={() =>
                            runBulk(`Zu „${l.name}"`, async (ids) => {
                              const res = await addCompaniesToList({ listId: l.id, companyIds: ids });
                              return res.ok ? res.added : 0;
                            })
                          }
                        >
                          {l.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setSelected(new Set())}
                  aria-label="Auswahl aufheben"
                >
                  <X />
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Spaltenkopf mit Filter-Dropdown; aktiver Filter wird hervorgehoben. */
function ColumnFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const active = options.find((o) => o.key === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "-mx-1.5 inline-flex h-6 items-center gap-1 rounded px-1.5 transition-colors hover:bg-surface-3 hover:text-fg",
            active && "bg-accent-soft text-accent-fg hover:bg-accent-soft",
          )}
          aria-label={`${label} filtern`}
        >
          <span className="truncate">{active ? `${label}: ${active.label}` : label}</span>
          {active ? <Filter className="size-3" /> : <ChevronDown className="size-3 opacity-60" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{label} filtern</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuRadioItem value="">Alle</DropdownMenuRadioItem>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.key} value={o.key}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
