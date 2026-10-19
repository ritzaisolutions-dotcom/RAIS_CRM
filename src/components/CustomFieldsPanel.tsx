"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import {
  deactivateCustomFieldDef,
  reorderCustomFieldDefs,
  upsertCustomFieldDef,
} from "@/lib/sales/actions";
import type { CustomFieldDef, CustomFieldType } from "@/lib/sales/types";

const FIELD_TYPES: { id: CustomFieldType; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "number", label: "Zahl" },
  { id: "url", label: "URL" },
  { id: "phone", label: "Telefon" },
  { id: "single_select", label: "Auswahl" },
  { id: "multi_select", label: "Mehrfachauswahl" },
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

export function CustomFieldsPanel({ defs }: { defs: CustomFieldDef[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [optionsRaw, setOptionsRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const active = defs.filter((d) => d.active);
  const inactive = defs.filter((d) => !d.active);

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const order = active.map((d) => d.id);
    const from = order.indexOf(dragId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, dragId);
    setDragId(null);
    start(async () => {
      await reorderCustomFieldDefs(order);
      router.refresh();
    });
  }

  return (
    <section className="dense-panel">
      <h2 className="section-h">Freie Felder</h2>
      <p className="muted">
        Notion-artige Spalten für Leads. Ausblenden deaktiviert nur — Werte
        bleiben. Reihenfolge per Ziehen.
      </p>

      <ul className="task-list" style={{ marginTop: "0.75rem" }}>
        {active.map((d) => (
          <li
            key={d.id}
            className="task-item"
            draggable
            onDragStart={() => setDragId(d.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(d.id)}
          >
            <div className="form-actions wrap" style={{ gap: "0.35rem" }}>
              <GripVertical className="h-4 w-4 text-rais-stone" />
              <div>
                <strong>{d.name}</strong>
                <div className="muted">
                  {d.slug} · {FIELD_TYPES.find((t) => t.id === d.field_type)?.label}
                  {d.options.length ? ` · ${d.options.join(", ")}` : ""}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await deactivateCustomFieldDef(d.id);
                  router.refresh();
                })
              }
            >
              Ausblenden
            </button>
          </li>
        ))}
      </ul>

      {inactive.length ? (
        <details style={{ marginTop: "0.75rem" }}>
          <summary className="muted cursor-pointer">
            Deaktiviert ({inactive.length})
          </summary>
          <ul className="task-list">
            {inactive.map((d) => (
              <li key={d.id} className="task-item">
                <div>
                  <strong>{d.name}</strong>
                  <div className="muted">{d.slug}</div>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await upsertCustomFieldDef({
                        id: d.id,
                        name: d.name,
                        slug: d.slug,
                        field_type: d.field_type,
                        options: d.options,
                        active: true,
                        sort_order: d.sort_order,
                      });
                      router.refresh();
                    })
                  }
                >
                  Reaktivieren
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <form
        className="stack"
        style={{ marginTop: "1rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const options =
              fieldType === "single_select" || fieldType === "multi_select"
                ? optionsRaw
                    .split(/[\n,]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                : [];
            const res = await upsertCustomFieldDef({
              name,
              slug: slug || slugify(name),
              field_type: fieldType,
              options,
              active: true,
              sort_order: active.length,
            });
            if (res.error) {
              setError(res.error);
              return;
            }
            setError(null);
            setName("");
            setSlug("");
            setOptionsRaw("");
            router.refresh();
          });
        }}
      >
        <div className="grid-2">
          <div className="field">
            <label>Name</label>
            <input
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div className="field">
            <label>Slug</label>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Typ</label>
            <select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {fieldType === "single_select" || fieldType === "multi_select" ? (
          <div className="field">
            <label>Optionen (Komma oder Zeile)</label>
            <textarea
              rows={3}
              value={optionsRaw}
              onChange={(e) => setOptionsRaw(e.target.value)}
            />
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Feld anlegen
        </button>
      </form>
    </section>
  );
}
