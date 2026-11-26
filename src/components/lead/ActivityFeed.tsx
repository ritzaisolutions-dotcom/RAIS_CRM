"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowRightLeft,
  CalendarClock,
  CheckSquare,
  Ellipsis,
  Handshake,
  History,
  Mail,
  MessageSquare,
  PhoneCall,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/panel";
import { LinkedinIcon } from "@/components/leads/BrandIcons";
import { voidTouchpoint } from "@/lib/sales/actions";
import { BUSINESS_TZ } from "@/lib/sales/dates";
import { formatDateDe, relativePast } from "@/lib/sales/leads";
import {
  ERGEBNIS_LABELS,
  type Person,
  type TouchKanal,
  type Touchpoint,
} from "@/lib/sales/types";
import { cn } from "@/lib/utils";

const KANAL_META: Record<
  TouchKanal,
  { label: string; Icon: (p: { className?: string }) => React.ReactNode; tone: string }
> = {
  call: { label: "Anruf", Icon: PhoneCall, tone: "text-[var(--tone-blue-fg)] bg-[var(--tone-blue-bg)]" },
  email: { label: "E-Mail", Icon: Mail, tone: "text-[var(--tone-violet-fg)] bg-[var(--tone-violet-bg)]" },
  note: { label: "Notiz", Icon: StickyNote, tone: "text-[var(--tone-yellow-fg)] bg-[var(--tone-yellow-bg)]" },
  task: { label: "Aufgabe", Icon: CheckSquare, tone: "text-[var(--tone-green-fg)] bg-[var(--tone-green-bg)]" },
  dm: { label: "LinkedIn-DM", Icon: LinkedinIcon, tone: "text-[var(--tone-blue-fg)] bg-[var(--tone-blue-bg)]" },
  sms: { label: "SMS", Icon: MessageSquare, tone: "text-fg-muted bg-surface-3" },
  meeting: { label: "Meeting", Icon: Handshake, tone: "text-[var(--tone-green-fg)] bg-[var(--tone-green-bg)]" },
  engagement: { label: "Engagement", Icon: Sparkles, tone: "text-fg-muted bg-surface-3" },
  status_change: { label: "Status", Icon: ArrowRightLeft, tone: "text-fg-muted bg-surface-3" },
};

const timeFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: BUSINESS_TZ,
  dateStyle: "medium",
  timeStyle: "short",
});

function headline(t: Touchpoint): string {
  const meta = KANAL_META[t.kanal] ?? KANAL_META.note;
  const note = t.notiz?.trim() ?? "";
  if (note.startsWith("Pipeline → ")) return `Status → ${note.slice("Pipeline → ".length)}`;
  if (note.startsWith("Wiedervorlage → ")) return note;
  if (t.kanal === "call" && t.ergebnis !== "kein_ergebnis") {
    return `Anruf · ${ERGEBNIS_LABELS[t.ergebnis]}`;
  }
  if (t.kanal === "email") {
    const m = note.match(/^E-Mail \(([^)]+)\) an ([^:]+): (.*)$/m);
    if (m) return `E-Mail ${m[1]} an ${m[2]}`;
  }
  return meta.label;
}

function bodyOf(t: Touchpoint): string | null {
  const note = t.notiz?.trim();
  if (!note) return null;
  if (note.startsWith("Pipeline → ") || note.startsWith("Wiedervorlage → ")) return null;
  if (t.kanal === "email") {
    const m = note.match(/^E-Mail \([^)]+\) an [^:]+: (.*)\n\n([\s\S]*)$/);
    if (m) return `${m[1]}\n\n${m[2]}`;
  }
  return note;
}

function Entry({
  t,
  people,
  companyId,
}: {
  t: Touchpoint;
  people: Map<string, Person>;
  companyId: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, start] = useTransition();
  const meta = KANAL_META[t.kanal] ?? KANAL_META.note;
  const body = bodyOf(t);
  const long = (body?.length ?? 0) > 280 || (body?.split("\n").length ?? 0) > 5;
  const voided = Boolean(t.voided_at);
  const person = t.person_id ? people.get(t.person_id) : null;

  return (
    <li className={cn("relative flex gap-3 pb-5", voided && "opacity-55")}>
      <span
        className={cn(
          "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-bg [&_svg]:size-3.5",
          meta.tone,
        )}
      >
        <meta.Icon />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 text-[13px]">
            <span className={cn("font-medium", voided && "line-through")}>{headline(t)}</span>
            {person ? <span className="text-fg-muted"> · {person.name}</span> : null}
            {voided ? (
              <Badge tone="red" className="ml-2">
                Storniert{t.void_grund ? `: ${t.void_grund}` : ""}
              </Badge>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <time
              dateTime={t.occurred_at}
              title={timeFmt.format(new Date(t.occurred_at))}
              className="text-xs text-fg-subtle"
              suppressHydrationWarning
            >
              {relativePast(t.occurred_at)}
            </time>
            {!voided ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="rounded p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                  aria-label="Eintrag – Aktionen"
                  disabled={pending}
                >
                  <Ellipsis className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    destructive
                    onSelect={() =>
                      start(async () => {
                        const grund = prompt("Eintrag stornieren — Grund (optional):");
                        if (grund === null) return;
                        const res = await voidTouchpoint(t.id, companyId, grund || null);
                        if (res.error) alert(res.error);
                        router.refresh();
                      })
                    }
                  >
                    Als Fehleingabe stornieren
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        {body ? (
          <div className="mt-1.5 rounded-md border border-line bg-surface px-3 py-2">
            <p
              className={cn(
                "whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg",
                long && !expanded && "line-clamp-5",
              )}
            >
              {body}
            </p>
            {long ? (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="mt-1 text-xs font-medium text-fg-muted hover:text-fg"
              >
                {expanded ? "Weniger" : "Mehr anzeigen"}
              </button>
            ) : null}
          </div>
        ) : null}
        {t.naechster_touch && !(t.notiz ?? "").startsWith("Wiedervorlage → ") ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-fg-subtle">
            <CalendarClock className="size-3" />
            Wiedervorlage {formatDateDe(t.naechster_touch)}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function ActivityFeed({
  touchpoints,
  total,
  people,
  companyId,
}: {
  touchpoints: Touchpoint[];
  total: number;
  people: Person[];
  companyId: string;
}) {
  const byId = new Map(people.map((p) => [p.id, p]));
  if (touchpoints.length === 0) {
    return (
      <EmptyState
        icon={<History />}
        title="Noch keine Aktivität"
        description="Notizen, Anrufe, E-Mails und Statuswechsel erscheinen hier."
      />
    );
  }
  return (
    <div>
      <ol className="relative before:absolute before:bottom-6 before:left-[13px] before:top-2 before:w-px before:bg-line">
        {touchpoints.map((t) => (
          <Entry key={t.id} t={t} people={byId} companyId={companyId} />
        ))}
      </ol>
      {total > touchpoints.length ? (
        <p className="pl-10 text-xs text-fg-subtle">
          Die letzten {touchpoints.length} von {total} Einträgen.
        </p>
      ) : null}
    </div>
  );
}
