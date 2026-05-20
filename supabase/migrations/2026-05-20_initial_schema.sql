-- =============================================================================
-- RAIS CRM — Initial Schema Snapshot
-- Captured: 2026-05-20
-- Project:  qdywaenmojdxhfxqbvun
--
-- This file documents the schema as it existed when Phase 4 was implemented.
-- It is NOT re-runnable (tables already exist); it is a reference snapshot.
-- For a full re-install, apply each migration in date order.
-- =============================================================================

-- ── crm_contacts ─────────────────────────────────────────────────────────────
-- Primary CRM table. Frontend writes user-editable fields.
-- n8n automation writes enrichment fields (see n8n-workflows/SCHEMA_MAP.md).

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id                 text        PRIMARY KEY,             -- nanoid, set by frontend
  created            bigint      NOT NULL,                -- Date.now() ms timestamp
  firma              text        NOT NULL,
  kontakt            text,                                -- Ansprechpartner
  title              text,                                -- Titel / Anrede
  telefon            text,
  email              text,
  website            text,
  status             text        DEFAULT 'neu',
  followup           text,                                -- ISO date string YYYY-MM-DD
  roi                integer     DEFAULT 1,               -- 1=Niedrig 2=Mittel 3=Hoch
  reviews            text,                                -- Google review count (string)
  stadt              text,
  region             text,
  gewerk             text,
  besonderheit       text,                                -- Website-Analyse / Notiz (legacy)
  notiz              text,                                -- User-editable note
  touches            jsonb       DEFAULT '[]',            -- [{status, datum, notiz}, ...]
  extra              jsonb       DEFAULT '{}',            -- Overflow JSON for enrichment fields
  synced_at          timestamptz DEFAULT now(),
  status_changed_at  text,                                -- ISO date YYYY-MM-DD
  -- Email tracking (written by WF4/WF5/WF6 and frontend)
  email_1_sent       date,
  email_1_subject    text,
  email_2_sent       date,
  followup_sent      date,
  email_status       text,
  unsubscribed       boolean     DEFAULT false,
  reply_received     boolean     DEFAULT false
);

-- RLS
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON public.crm_contacts
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_contacts;


-- ── crm_clients ──────────────────────────────────────────────────────────────
-- Paying / won clients (separate from prospecting leads).

CREATE TABLE IF NOT EXISTS public.crm_clients (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created          timestamptz DEFAULT now(),
  firma            text        NOT NULL,
  kontakt          text,
  telefon          text,
  email            text,
  website          text,
  kontakt_medium   text,                                  -- whatsapp|telegram|email|telefon|sonstiges
  scope            text,                                  -- Project scope / description
  status           text        DEFAULT 'aktiv',           -- aktiv|pause|abgeschlossen|verloren
  notiz            text,
  naechste_action  text,
  naechste_datum   date,
  synced_at        timestamptz
);

ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon full access" ON public.crm_clients
  FOR ALL TO anon USING (true) WITH CHECK (true);


-- ── wf_runs ──────────────────────────────────────────────────────────────────
-- Written by n8n workflows to track run status. Frontend polls this table.

CREATE TABLE IF NOT EXISTS public.wf_runs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wf          text        NOT NULL,                       -- wf1|wf2|wf3
  stadt       text,
  status      text        DEFAULT 'running',              -- running|done|error
  count       integer     DEFAULT 0,                      -- leads discovered/processed
  finished_at timestamptz,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.wf_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read/write" ON public.wf_runs
  FOR ALL TO anon USING (true) WITH CHECK (true);


-- ── roi_leads ────────────────────────────────────────────────────────────────
-- Inbound leads from the ROI calculator on the marketing site.

CREATE TABLE IF NOT EXISTS public.roi_leads (
  id                  bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name                text        NOT NULL CHECK (length(trim(name)) >= 2),
  email               text        NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  business_name       text        NOT NULL CHECK (length(trim(business_name)) >= 2),
  consent             boolean     DEFAULT false,
  estimated_roi       numeric,
  monthly_lost_leads  integer,
  potential_revenue   numeric,
  source              text        DEFAULT 'roi_calculator_webhook',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  original_payload    jsonb
);

ALTER TABLE public.roi_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public inserts for ROI leads" ON public.roi_leads
  FOR INSERT TO anon, authenticated WITH CHECK (consent = true);
CREATE POLICY "Authenticated users can view all ROI leads" ON public.roi_leads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can update ROI leads" ON public.roi_leads
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Prevent deletion of ROI leads" ON public.roi_leads
  FOR DELETE TO authenticated USING (false);


-- ── inbound_leads ─────────────────────────────────────────────────────────────
-- Inbound contact form submissions.

CREATE TABLE IF NOT EXISTS public.inbound_leads (
  id               bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name             text        NOT NULL,
  email            text        NOT NULL,
  website_status   text,
  biggest_challenge text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.inbound_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon insert only" ON public.inbound_leads
  FOR INSERT TO anon WITH CHECK (true);
