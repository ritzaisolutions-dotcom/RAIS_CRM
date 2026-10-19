"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTask,
  insertTouchpoint,
  setListPipelineStatus,
} from "@/lib/sales/actions";
import {
  FOLLOW_UP_PRESETS,
  dueFromFollowUpPreset,
  skipWeekend,
  type FollowUpPresetId,
} from "@/lib/sales/dates";
import { EMAIL_TASK_PRESETS } from "@/lib/sales/types";
import type { EmailTaskPreset, PipelineStatus } from "@/lib/sales/types";

type MenuState = {
  x: number;
  y: number;
  companyId: string;
  firma: string;
} | null;

type Modal =
  | { kind: "email"; companyId: string; firma: string }
  | { kind: "context"; companyId: string; firma: string }
  | { kind: "custom-date"; companyId: string; firma: string }
  | null;

export function useListeContextMenu() {
  const [menu, setMenu] = useState<MenuState>(null);
  const [modal, setModal] = useState<Modal>(null);

  function openMenu(
    e: React.MouseEvent,
    companyId: string,
    firma: string,
  ) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, companyId, firma });
  }

  function closeMenu() {
    setMenu(null);
  }

  return { menu, setMenu, modal, setModal, openMenu, closeMenu };
}

export function ListeContextMenuLayer({
  menu,
  modal,
  onCloseMenu,
  onOpenModal,
  onCloseModal,
  desk = "dialen",
}: {
  menu: MenuState;
  modal: Modal;
  onCloseMenu: () => void;
  onOpenModal: (m: Modal) => void;
  onCloseModal: () => void;
  desk?: "dialen" | "termine" | "kunden";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function moveDesk(status: PipelineStatus) {
    if (!menu) return;
    const naechsterTouch = dueFromFollowUpPreset("d2");
    start(async () => {
      const res = await setListPipelineStatus({
        companyId: menu.companyId,
        pipelineStatus: status,
        kanal: "status_change",
        naechsterTouch,
      });
      if (res.error) setError(res.error);
      else {
        onCloseMenu();
        router.refresh();
      }
    });
  }

  useEffect(() => {
    if (!menu) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseMenu();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseMenu();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu, onCloseMenu]);

  function createFollowUp(
    companyId: string,
    firma: string,
    preset: Exclude<FollowUpPresetId, "custom">,
  ) {
    const due = dueFromFollowUpPreset(preset);
    start(async () => {
      const res = await createTask({
        company_id: companyId,
        titel: `Follow-up: ${firma}`,
        due_on: due,
        art: "follow_up",
        set_naechster: true,
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        onCloseMenu();
        router.refresh();
      }
    });
  }

  return (
    <>
      {menu ? (
        <div
          ref={menuRef}
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <div className="context-menu-title">{menu.firma}</div>
          {desk !== "kunden" ? (
            <>
              <div className="context-menu-section">Desk</div>
              {desk === "dialen" ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={pending}
                  onClick={() => moveDesk("set_appointment")}
                >
                  → Termine (Termin gebucht)
                </button>
              ) : null}
              {desk === "termine" ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() => moveDesk("kunde")}
                  >
                    → Kunde
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() => moveDesk("callback")}
                  >
                    Zurück Dialen (Rückruf)
                  </button>
                </>
              ) : null}
            </>
          ) : null}
          <div className="context-menu-section">Follow-up</div>
          {FOLLOW_UP_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => createFollowUp(menu.companyId, menu.firma, p.id)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await createTask({
                  company_id: menu.companyId,
                  titel: `No-Show: ${menu.firma}`,
                  due_on: dueFromFollowUpPreset("d1"),
                  art: "follow_up",
                  set_naechster: true,
                });
                if (!res.ok) setError(res.error);
                else {
                  onCloseMenu();
                  router.refresh();
                }
              })
            }
          >
            No-Show (Morgen)
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await createTask({
                  company_id: menu.companyId,
                  titel: `Angebot senden: ${menu.firma}`,
                  due_on: dueFromFollowUpPreset("d2"),
                  art: "follow_up",
                  set_naechster: true,
                });
                if (!res.ok) setError(res.error);
                else {
                  onCloseMenu();
                  router.refresh();
                }
              })
            }
          >
            Angebot senden
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenModal({
                kind: "custom-date",
                companyId: menu.companyId,
                firma: menu.firma,
              });
              onCloseMenu();
            }}
          >
            Bestimmtes Datum…
          </button>
          <div className="context-menu-section">Todo</div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenModal({
                kind: "email",
                companyId: menu.companyId,
                firma: menu.firma,
              });
              onCloseMenu();
            }}
          >
            E-Mail-Todo…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenModal({
                kind: "context",
                companyId: menu.companyId,
                firma: menu.firma,
              });
              onCloseMenu();
            }}
          >
            Anruf-Kontext…
          </button>
          {error ? <p className="context-menu-error">{error}</p> : null}
        </div>
      ) : null}

      {modal?.kind === "email" ? (
        <EmailTodoModal
          companyId={modal.companyId}
          firma={modal.firma}
          onClose={onCloseModal}
        />
      ) : null}
      {modal?.kind === "context" ? (
        <CallContextModal
          companyId={modal.companyId}
          onClose={onCloseModal}
        />
      ) : null}
      {modal?.kind === "custom-date" ? (
        <CustomDateModal
          companyId={modal.companyId}
          firma={modal.firma}
          onClose={onCloseModal}
        />
      ) : null}
    </>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel dense-panel"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="section-h">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function EmailTodoModal({
  companyId,
  firma,
  onClose,
}: {
  companyId: string;
  firma: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [preset, setPreset] = useState<EmailTaskPreset>("info");
  const [note, setNote] = useState("");
  const [due, setDue] = useState(dueFromFollowUpPreset("d2"));
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalShell title={`E-Mail-Todo · ${firma}`} onClose={onClose}>
      <div className="stack">
        <div className="form-actions wrap">
          {EMAIL_TASK_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn${preset === p.id ? " btn-primary" : ""}`}
              onClick={() => setPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="field">
          <label>Fällig</label>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(skipWeekend(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Kontext (optional)</label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Was soll in der Mail stehen?"
          />
        </div>
        {error ? <p className="muted">{error}</p> : null}
        <div className="form-actions wrap">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const label =
                  EMAIL_TASK_PRESETS.find((p) => p.id === preset)?.label ??
                  "E-Mail";
                const res = await createTask({
                  company_id: companyId,
                  titel: `E-Mail: ${label} · ${firma}`,
                  due_on: skipWeekend(due),
                  art: "email",
                  email_preset: preset,
                  notiz: note || null,
                  set_naechster: false,
                });
                if (!res.ok) setError(res.error);
                else {
                  onClose();
                  router.refresh();
                }
              })
            }
          >
            Todo anlegen
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function CallContextModal({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalShell title="Anruf-Kontext" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>Was kam aus dem Gespräch?</label>
          <textarea
            rows={3}
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Kurz kontext (3 Zeilen)…"
          />
        </div>
        {error ? <p className="muted">{error}</p> : null}
        <div className="form-actions wrap">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !note.trim()}
            onClick={() =>
              start(async () => {
                const res = await insertTouchpoint({
                  company_id: companyId,
                  person_id: null,
                  kanal: "note",
                  ergebnis: "kein_ergebnis",
                  notiz: note.trim(),
                  naechster_touch: null,
                  abbruchgrund: null,
                });
                if (res.error) setError(res.error);
                else {
                  onClose();
                  router.refresh();
                }
              })
            }
          >
            In Timeline speichern
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function CustomDateModal({
  companyId,
  firma,
  onClose,
}: {
  companyId: string;
  firma: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [due, setDue] = useState(dueFromFollowUpPreset("w1"));
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalShell title={`Follow-up Datum · ${firma}`} onClose={onClose}>
      <div className="stack">
        <div className="field">
          <label>Fällig (Wochenende → Montag)</label>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(skipWeekend(e.target.value))}
          />
        </div>
        {error ? <p className="muted">{error}</p> : null}
        <div className="form-actions wrap">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await createTask({
                  company_id: companyId,
                  titel: `Follow-up: ${firma}`,
                  due_on: skipWeekend(due),
                  art: "follow_up",
                  set_naechster: true,
                });
                if (!res.ok) setError(res.error);
                else {
                  onClose();
                  router.refresh();
                }
              })
            }
          >
            Anlegen
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
