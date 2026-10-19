"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { completeTask } from "@/lib/sales/actions";
import { businessToday } from "@/lib/sales/dates";
import type { OpenTasksFilter } from "@/lib/sales/queries";
import { TASK_ART_LABELS } from "@/lib/sales/types";
import type { SalesTask, TaskArt } from "@/lib/sales/types";

const FILTERS: { id: OpenTasksFilter; label: string }[] = [
  { id: "today", label: "Heute" },
  { id: "overdue", label: "Überfällig" },
  { id: "week", label: "Diese Woche" },
  { id: "all", label: "Alle" },
];

const ARTS: { id: TaskArt | ""; label: string }[] = [
  { id: "", label: "Alle Arten" },
  { id: "follow_up", label: "Follow-up" },
  { id: "email", label: "E-Mail" },
  { id: "sonstiges", label: "Sonstiges" },
];

export function TodosInbox({
  tasks,
  initialFilter,
  initialArt,
  badgeCount,
}: {
  tasks: SalesTask[];
  initialFilter: OpenTasksFilter;
  initialArt: TaskArt | "";
  badgeCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const today = businessToday();

  function navigate(next: { filter?: OpenTasksFilter; art?: TaskArt | "" }) {
    const filter = next.filter ?? initialFilter;
    const art = next.art !== undefined ? next.art : initialArt;
    const qs = new URLSearchParams();
    if (filter !== "today") qs.set("filter", filter);
    if (art) qs.set("art", art);
    const q = qs.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  return (
    <div className="stack">
      <header>
        <h1 className="m-0 font-[family-name:var(--font-source-serif)] text-2xl font-semibold">
          Todos
          {badgeCount > 0 ? (
            <span className="todo-badge" style={{ marginLeft: "0.5rem" }}>
              {badgeCount}
            </span>
          ) : null}
        </h1>
        <p className="muted mb-0 mt-1">
          Follow-ups und E-Mail-Todos · fällig heute / überfällig: {badgeCount}
        </p>
      </header>

      <div className="form-actions wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`btn${initialFilter === f.id ? " btn-primary" : ""}`}
            onClick={() => navigate({ filter: f.id })}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="form-actions wrap">
        {ARTS.map((a) => (
          <button
            key={a.id || "all-art"}
            type="button"
            className={`btn${initialArt === a.id ? " btn-primary" : ""}`}
            onClick={() => navigate({ art: a.id })}
          >
            {a.label}
          </button>
        ))}
      </div>

      <section className="dense-panel">
        {tasks.length === 0 ? (
          <p className="muted mb-0">Keine offenen Todos in diesem Filter.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Firma</th>
                  <th>Titel</th>
                  <th>Art</th>
                  <th>Fällig</th>
                  <th>Notiz</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const art = t.art ?? "follow_up";
                  const overdue = t.due_on < today;
                  return (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/firma/${t.company_id}`}>
                          {t.firma ?? "Firma"}
                        </Link>
                      </td>
                      <td>{t.titel}</td>
                      <td>{TASK_ART_LABELS[art]}</td>
                      <td>
                        {t.due_on}
                        {overdue ? (
                          <span className="muted"> · überfällig</span>
                        ) : null}
                      </td>
                      <td className="muted">
                        {(t.notiz ?? "").slice(0, 80) || "—"}
                      </td>
                      <td>
                        <div className="form-actions wrap">
                          <button
                            type="button"
                            className="btn"
                            disabled={pending}
                            onClick={() =>
                              start(async () => {
                                await completeTask(t.id, t.company_id);
                                router.refresh();
                              })
                            }
                          >
                            Erledigt
                          </button>
                          <Link className="btn" href={`/firma/${t.company_id}`}>
                            Firma
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
