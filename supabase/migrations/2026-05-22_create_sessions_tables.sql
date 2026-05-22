-- ============================================================
-- Session Tracker Tables
-- RAIS CRM — Phase 2
-- Created: 2026-05-22
-- ============================================================

-- Haupt-Session-Tabelle
CREATE TABLE IF NOT EXISTS crm_sessions (
  id                    bigserial PRIMARY KEY,
  name                  text,
  -- Timing
  started_at            timestamptz NOT NULL DEFAULT now(),
  ended_at              timestamptz,
  paused_seconds        integer NOT NULL DEFAULT 0,
  duration_seconds      integer,
  -- Konfiguration
  timer_mode            text NOT NULL DEFAULT 'free'
                        CHECK (timer_mode IN ('free', 'countdown')),
  timer_target_seconds  integer,
  -- Ergebnis (denormalized für schnelle History-Abfrage)
  leads_played          integer NOT NULL DEFAULT 0,
  status_breakdown      jsonb NOT NULL DEFAULT '{}',
  -- State
  is_active             boolean NOT NULL DEFAULT true,
  is_paused             boolean NOT NULL DEFAULT false,
  -- Ownership
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Session Events — jede Status-Änderung während einer Session
CREATE TABLE IF NOT EXISTS crm_session_events (
  id            bigserial PRIMARY KEY,
  session_id    bigint NOT NULL REFERENCES crm_sessions(id) ON DELETE CASCADE,
  contact_id    text,
  contact_name  text,
  status_from   text,
  status_to     text NOT NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_events_session_id
  ON crm_session_events(session_id);

CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON crm_sessions(is_active, created_at DESC);

-- RLS
ALTER TABLE crm_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_session_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_sessions"
  ON crm_sessions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_session_events"
  ON crm_session_events FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- updated_at Trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON crm_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
