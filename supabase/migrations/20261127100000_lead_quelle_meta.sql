-- Neue Lead-Quelle „Meta“ (Leads aus Facebook-/Instagram-Ads).
-- ADD VALUE steht allein, weil ein neuer Enum-Wert erst nach dem Commit nutzbar ist.
ALTER TYPE sales.lead_quelle ADD VALUE IF NOT EXISTS 'Meta';
