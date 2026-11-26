"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, ChevronDown, Globe, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from "@/components/ui/menu";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  TiktokIcon,
  XingIcon,
  YoutubeIcon,
} from "@/components/leads/BrandIcons";
import { setListPipelineStatus, updateListFields } from "@/lib/sales/actions";
import { setLeadKategorie, setLeadQuelle, setWiedervorlage } from "@/lib/sales/leadActions";
import { businessToday, skipWeekend } from "@/lib/sales/dates";
import {
  FOLLOW_UP_QUICK,
  STATUS_MENU,
  displayKategorie,
  dueTone,
  kategorieTone,
  formatDateDe,
  nichtErreichtCount,
  normalizeUrl,
  relativeDueLabel,
  resolveStatusChoice,
  statusLabel,
  statusTone,
} from "@/lib/sales/leads";
import {
  LEAD_QUELLEN,
  LEAD_QUELLE_LABELS,
  type LeadQuelle,
  type PipelineStatus,
} from "@/lib/sales/types";
import { cn } from "@/lib/utils";

/** Kanal für den Status-Touch: Anruf-Ergebnisse zählen als Anruf. */
function kanalFor(status: PipelineStatus) {
  return nichtErreichtCount(status) > 0 ||
    status === "callback" ||
    status === "set_appointment"
    ? ("call" as const)
    : ("status_change" as const);
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export function StatusMenu({
  companyId,
  status,
  size = "sm",
  onChanged,
}: {
  companyId: string;
  status: PipelineStatus | null;
  size?: "sm" | "md";
  onChanged?: (next: PipelineStatus) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<PipelineStatus | null>(status);
  const [error, setError] = useState<string | null>(null);
  const current = pending ? optimistic : status;
  const menuValue = nichtErreichtCount(current) > 0 ? "kein_anschluss_1" : (current ?? "");

  function choose(value: string) {
    const next = resolveStatusChoice(value as PipelineStatus, current);
    if (next === current) return;
    setOptimistic(next);
    start(async () => {
      const res = await setListPipelineStatus({
        companyId,
        pipelineStatus: next,
        kanal: kanalFor(next),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      onChanged?.(next);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "group inline-flex items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          pending && "opacity-60",
        )}
        title={error ?? "Status ändern"}
        onClick={(e) => e.stopPropagation()}
      >
        <Badge
          tone={statusTone(current)}
          dot
          className={cn(size === "md" && "h-6 px-2 text-xs", error && "ring-1 ring-[var(--tone-red-fg)]")}
        >
          {statusLabel(current)}
          <ChevronDown className="size-3 opacity-50 group-hover:opacity-100" />
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={menuValue} onValueChange={choose}>
          {STATUS_MENU.map((s) => (
            <DropdownMenuRadioItem key={s.value} value={s.value}>
              <Badge tone={statusTone(s.value)} dot className="bg-transparent px-0">
                {s.value === "kein_anschluss_1" && nichtErreichtCount(current) > 0
                  ? `Nicht erreicht (${Math.min(nichtErreichtCount(current) + 1, 5)}. Versuch)`
                  : s.label}
              </Badge>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Wiedervorlage                                                       */
/* ------------------------------------------------------------------ */

export function DueText({ date, className }: { date: string | null; className?: string }) {
  if (!date) return <span className={cn("text-fg-subtle", className)}>—</span>;
  const tone = dueTone(date);
  return (
    <span
      title={formatDateDe(date)}
      className={cn(
        "tabular-nums",
        tone === "overdue" && "font-medium text-[var(--tone-red-fg)]",
        tone === "today" && "font-medium text-accent-fg",
        tone === "future" && "text-fg",
        className,
      )}
    >
      {relativeDueLabel(date)}
    </span>
  );
}

export function FollowUpPicker({
  companyId,
  date,
  personId,
  variant = "inline",
}: {
  companyId: string;
  date: string | null;
  personId?: string | null;
  variant?: "inline" | "field";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState(date ?? "");
  const [error, setError] = useState<string | null>(null);

  function save(next: string) {
    const rolled = skipWeekend(next);
    start(async () => {
      const res = await setWiedervorlage({ companyId, date: rolled, personId });
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setOpen(false);
      router.refresh();
    });
  }

  const today = businessToday();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          variant === "inline" && "-mx-1 px-1 py-0.5 hover:bg-surface-3",
          variant === "field" &&
            "h-8 w-full justify-between rounded-md border border-line-strong bg-surface px-2.5 hover:bg-surface-2",
          pending && "opacity-60",
        )}
      >
        {date ? (
          <DueText date={date} />
        ) : (
          <span className="flex items-center gap-1 text-fg-subtle hover:text-fg-muted">
            {variant === "inline" ? <CalendarClock className="size-3.5" /> : null}
            Festlegen
          </span>
        )}
        {variant === "field" ? <CalendarClock className="size-3.5 text-fg-muted" /> : null}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" onClick={(e) => e.stopPropagation()}>
        <p className="px-1.5 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
          Wiedervorlage
        </p>
        <div className="grid">
          {FOLLOW_UP_QUICK.map((p) => {
            const due = p.due(today);
            return (
              <button
                key={p.key}
                type="button"
                disabled={pending}
                onClick={() => save(due)}
                className="flex h-8 items-center justify-between rounded-md px-2 text-[13px] hover:bg-surface-2"
              >
                <span>{p.label}</span>
                <span className="text-xs text-fg-subtle">{formatDateDe(due)}</span>
              </button>
            );
          })}
        </div>
        <form
          className="mt-1.5 flex gap-1.5 border-t border-line px-0.5 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom) save(custom);
          }}
        >
          <Input
            type="date"
            value={custom}
            min={today}
            onChange={(e) => setCustom(e.target.value)}
            className="h-7 text-xs"
            aria-label="Datum wählen"
          />
          <Button type="submit" size="sm" disabled={!custom || pending}>
            OK
          </Button>
        </form>
        <p className="px-1.5 pt-1.5 text-[11px] text-fg-subtle">
          Wochenenden rollen auf Montag.
        </p>
        {error ? (
          <p className="px-1.5 pt-1 text-xs text-[var(--tone-red-fg)]">{error}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Quelle                                                              */
/* ------------------------------------------------------------------ */

export function QuelleText({ quelle }: { quelle: LeadQuelle | null }) {
  if (!quelle) return <span className="text-fg-subtle">—</span>;
  return <span className="text-fg-muted">{LEAD_QUELLE_LABELS[quelle]}</span>;
}

export function QuelleMenu({
  companyId,
  quelle,
}: {
  companyId: string;
  quelle: LeadQuelle | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-md border border-line-strong bg-surface px-2.5 text-[13px] hover:bg-surface-2",
          pending && "opacity-60",
        )}
      >
        <QuelleText quelle={quelle} />
        <ChevronDown className="size-3.5 text-fg-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          value={quelle ?? ""}
          onValueChange={(v) =>
            start(async () => {
              await setLeadQuelle({ companyId, quelle: (v || null) as LeadQuelle | null });
              router.refresh();
            })
          }
        >
          {LEAD_QUELLEN.map((q) => (
            <DropdownMenuRadioItem key={q} value={q}>
              {LEAD_QUELLE_LABELS[q]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Social-Links                                                        */
/* ------------------------------------------------------------------ */

export type SocialKey =
  | "website"
  | "linkedin_url"
  | "xing_url"
  | "instagram_url"
  | "facebook_url"
  | "youtube_url"
  | "tiktok_url";

const SOCIALS: {
  key: SocialKey;
  label: string;
  Icon: (p: { className?: string }) => React.ReactNode;
  placeholder: string;
}[] = [
  { key: "website", label: "Website", Icon: Globe, placeholder: "beispiel.de" },
  {
    key: "linkedin_url",
    label: "LinkedIn",
    Icon: LinkedinIcon,
    placeholder: "linkedin.com/company/…",
  },
  { key: "xing_url", label: "XING", Icon: XingIcon, placeholder: "xing.com/pages/…" },
  {
    key: "instagram_url",
    label: "Instagram",
    Icon: InstagramIcon,
    placeholder: "instagram.com/…",
  },
  {
    key: "facebook_url",
    label: "Facebook",
    Icon: FacebookIcon,
    placeholder: "facebook.com/…",
  },
  { key: "youtube_url", label: "YouTube", Icon: YoutubeIcon, placeholder: "youtube.com/@…" },
  { key: "tiktok_url", label: "TikTok", Icon: TiktokIcon, placeholder: "tiktok.com/@…" },
];

/** Kompakte Icon-Reihe für Tabellenzeilen — nur vorhandene Links. */
export function SocialIcons({
  links,
}: {
  links: Partial<Record<SocialKey, string | null>>;
}) {
  const present = SOCIALS.filter((s) => links[s.key]);
  if (present.length === 0) return <span className="text-fg-subtle">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {present.map(({ key, label, Icon }) => (
        <Tooltip key={key} content={label}>
          <a
            href={normalizeUrl(links[key]) ?? "#"}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex size-6 items-center justify-center rounded text-fg-muted hover:bg-surface-3 hover:text-fg"
            aria-label={label}
          >
            <Icon className="size-3.5" />
          </a>
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * Button-Leiste im Lead-Steckbrief: vorhandene Links öffnen,
 * fehlende als gedimmtes „+" zum Einfügen.
 */
export function SocialButtons({
  companyId,
  links,
}: {
  companyId: string;
  links: Partial<Record<SocialKey, string | null>>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SocialKey | null>(null);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(key: SocialKey, raw: string) {
    const v = raw.trim();
    start(async () => {
      const res = await updateListFields(companyId, {
        [key]: v ? (key === "website" ? v : (normalizeUrl(v) ?? v)) : null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {SOCIALS.map(({ key, label, Icon, placeholder }) => {
          const url = links[key];
          return (
            <Popover
              key={key}
              open={editing === key}
              onOpenChange={(o) => {
                setEditing(o ? key : null);
                setValue(url ?? "");
                setError(null);
              }}
            >
              {url ? (
                <div className="flex overflow-hidden rounded-md border border-line-strong">
                  <Tooltip content={`${label} öffnen`}>
                    <a
                      href={normalizeUrl(url) ?? "#"}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex h-7 items-center gap-1.5 bg-surface px-2 text-xs font-medium text-fg hover:bg-surface-2"
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </a>
                  </Tooltip>
                  <PopoverTrigger
                    className="flex h-7 w-5 items-center justify-center border-l border-line-strong bg-surface text-fg-subtle hover:bg-surface-2 hover:text-fg"
                    aria-label={`${label} bearbeiten`}
                  >
                    <ChevronDown className="size-3" />
                  </PopoverTrigger>
                </div>
              ) : (
                <PopoverTrigger
                  className="flex h-7 items-center gap-1.5 rounded-md border border-dashed border-line-strong px-2 text-xs text-fg-subtle hover:border-fg-subtle hover:text-fg-muted"
                  title={`${label} hinzufügen`}
                >
                  <Icon className="size-3.5" />
                  <Plus className="size-3" />
                </PopoverTrigger>
              )}
              <PopoverContent className="w-72">
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(key, value);
                  }}
                >
                  <label className="text-xs font-medium text-fg-muted" htmlFor={`social-${key}`}>
                    {label}
                  </label>
                  <Input
                    id={`social-${key}`}
                    autoFocus
                    value={value}
                    placeholder={placeholder}
                    onChange={(e) => setValue(e.target.value)}
                  />
                  {error ? (
                    <p className="text-xs text-[var(--tone-red-fg)]">{error}</p>
                  ) : null}
                  <div className="flex justify-between gap-2">
                    {url ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => save(key, "")}
                      >
                        Entfernen
                      </Button>
                    ) : (
                      <span />
                    )}
                    <Button type="submit" size="sm" disabled={pending}>
                      Speichern
                    </Button>
                  </div>
                </form>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kategorie                                                           */
/* ------------------------------------------------------------------ */

export function KategorieMenu({
  companyId,
  kategorie,
  relationship,
}: {
  companyId: string;
  kategorie: "lead" | "kontakt";
  relationship: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const shown = displayKategorie(kategorie, relationship);
  if (shown === "kunde") {
    return (
      <span title="Kunde ergibt sich aus dem Status „Kunde“">
        <Badge tone="green">Kunde</Badge>
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-md border border-line-strong bg-surface px-2.5 text-[13px] hover:bg-surface-2",
          pending && "opacity-60",
        )}
      >
        <Badge tone={kategorieTone(shown)}>{shown === "kontakt" ? "Kontakt (Netzwerk)" : "Lead"}</Badge>
        <ChevronDown className="size-3.5 text-fg-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          value={kategorie}
          onValueChange={(v) =>
            start(async () => {
              await setLeadKategorie({ companyId, kategorie: v as "lead" | "kontakt" });
              router.refresh();
            })
          }
        >
          <DropdownMenuRadioItem value="lead">Lead (Zielgruppe)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="kontakt">Kontakt (Netzwerk)</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
