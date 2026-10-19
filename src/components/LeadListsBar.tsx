"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCompaniesToList,
  deleteLeadList,
  upsertLeadList,
} from "@/lib/sales/actions";
import type { DialenQueue, LeadList } from "@/lib/sales/types";

const QUEUES: { id: DialenQueue; label: string }[] = [
  { id: "", label: "Alle" },
  { id: "today", label: "Anrufliste heute" },
  { id: "wiedervorlage", label: "Wiedervorlage" },
  { id: "call", label: "CALL" },
  { id: "no_phone", label: "Ohne Telefon" },
];

export function LeadListsBar({
  lists,
  basePath = "/liste",
  currentListId = "",
  currentQueue = "",
  selectedIds = [],
  showQueues = true,
  status = "",
  due = "",
  q = "",
  sort = "",
}: {
  lists: LeadList[];
  basePath?: "/liste" | "/termine";
  currentListId?: string;
  currentQueue?: DialenQueue;
  selectedIds?: string[];
  showQueues?: boolean;
  status?: string;
  due?: string;
  q?: string;
  sort?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function href(patch: { list?: string; queue?: string }) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (due) params.set("due", due);
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    const list = "list" in patch ? patch.list : currentListId;
    const queue = "queue" in patch ? patch.queue : currentQueue;
    if (list) params.set("list", list);
    if (queue) params.set("queue", queue);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="stack">
      {showQueues ? (
        <div className="form-actions wrap">
          <span className="muted text-xs">Queues</span>
          {QUEUES.map((q) => (
            <Link
              key={q.id || "all"}
              href={href({ queue: q.id })}
              className={`btn${currentQueue === q.id ? " btn-primary" : ""}`}
            >
              {q.label}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="form-actions wrap">
        <span className="muted text-xs">Listen</span>
        <Link
          href={href({ list: "" })}
          className={`btn${!currentListId ? " btn-primary" : ""}`}
        >
          Alle
        </Link>
        {lists.map((l) => (
          <span key={l.id} className="form-actions wrap">
            <Link
              href={href({ list: l.id })}
              className={`btn${currentListId === l.id ? " btn-primary" : ""}`}
            >
              {l.name} ({l.member_count ?? 0})
            </Link>
            <button
              type="button"
              className="btn"
              title="Liste löschen"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    `Liste „${l.name}“ wirklich löschen? Alle Mitgliedschaften gehen verloren.`,
                  )
                ) {
                  return;
                }
                start(async () => {
                  await deleteLeadList(l.id);
                  router.refresh();
                });
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <form
        className="form-actions wrap"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          start(async () => {
            await upsertLeadList({ name: name.trim() });
            setName("");
            router.refresh();
          });
        }}
      >
        <input
          placeholder="Neue Liste…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn" disabled={pending}>
          Anlegen
        </button>
        {selectedIds.length > 0 && lists.length > 0 ? (
          <select
            defaultValue=""
            disabled={pending}
            onChange={(e) => {
              const listId = e.target.value;
              if (!listId) return;
              start(async () => {
                const res = await addCompaniesToList({
                  listId,
                  companyIds: selectedIds,
                });
                if (res.error) setMsg(res.error);
                else {
                  setMsg(
                    `${selectedIds.length} zur Liste (inkl. bereits Mitglied)`,
                  );
                  router.refresh();
                }
                e.target.value = "";
              });
            }}
          >
            <option value="">Auswahl zur Liste…</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        ) : null}
        {msg ? <span className="muted">{msg}</span> : null}
      </form>
    </div>
  );
}
