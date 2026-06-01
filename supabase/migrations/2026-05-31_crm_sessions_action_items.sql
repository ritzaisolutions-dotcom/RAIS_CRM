-- Session action queue (Aktion nötig leads per calling session)
ALTER TABLE public.crm_sessions
  ADD COLUMN IF NOT EXISTS action_items jsonb NOT NULL DEFAULT '[]';
