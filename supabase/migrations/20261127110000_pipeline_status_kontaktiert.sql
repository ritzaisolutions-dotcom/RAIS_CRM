-- Status „Kontaktiert“: angeschrieben (DM/E-Mail), aber noch keine Antwort.
-- Eigener Schritt, damit enum-Wert vor seiner Nutzung committet ist.
ALTER TYPE sales.pipeline_status ADD VALUE IF NOT EXISTS 'kontaktiert' AFTER 'neu';
