-- To-do Kategorien (2026-06-24)
BEGIN;

ALTER TABLE public.crm_todos
  ADD COLUMN IF NOT EXISTS category text;

-- Optional: bestehende To-dos ohne Kategorie → RAIS Sales
UPDATE public.crm_todos
SET category = 'rais_sales'
WHERE category IS NULL;

COMMIT;
