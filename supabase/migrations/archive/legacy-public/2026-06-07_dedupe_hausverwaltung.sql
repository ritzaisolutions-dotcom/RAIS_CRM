-- ============================================================
-- Hausverwaltung: Gewerk vereinheitlichen + Duplikate bereinigen
-- Date: 2026-06-07
--
-- Vorher: gewerk 'Hausverwaltung' (97) + 'hausverwaltung' (50)
-- Nachher: nur 'Hausverwaltung' (~138), 9 Gelbe-Seiten-Duplikate entfernt
-- ============================================================

-- ── PREVIEW (optional, vor Ausführung im SQL Editor) ────────
-- SELECT gewerk, source, COUNT(*) FROM crm_contacts
-- WHERE gewerk ILIKE '%hausverwaltung%' GROUP BY gewerk, source ORDER BY gewerk, source;
--
-- WITH pairs(keep_id, drop_id) AS (
--   VALUES
--     ('hv_rlp_024','immo_006'), ('hv_rlp_028','immo_028'), ('hv_rlp_025','immo_027'),
--     ('hv_rlp_006','immo_011'), ('hv_rlp_029','immo_004'), ('hv_rlp_014','immo_040'),
--     ('hv_rlp_010','immo_015'), ('hv_rlp_041','immo_030'), ('hv_rlp_037','immo_077')
-- )
-- SELECT p.keep_id, k.firma AS keep_firma, p.drop_id, d.firma AS drop_firma
-- FROM pairs p
-- JOIN crm_contacts k ON k.id = p.keep_id
-- JOIN crm_contacts d ON d.id = p.drop_id;

BEGIN;

-- Phase B: Felder vom Duplikat in den präziseren Keeper mergen
WITH pairs(keep_id, drop_id) AS (
  VALUES
    ('hv_rlp_024', 'immo_006'),
    ('hv_rlp_028', 'immo_028'),
    ('hv_rlp_025', 'immo_027'),
    ('hv_rlp_006', 'immo_011'),
    ('hv_rlp_029', 'immo_004'),
    ('hv_rlp_014', 'immo_040'),
    ('hv_rlp_010', 'immo_015'),
    ('hv_rlp_041', 'immo_030'),
    ('hv_rlp_037', 'immo_077')
)
UPDATE public.crm_contacts k
SET
  kontakt = COALESCE(NULLIF(trim(k.kontakt), ''), NULLIF(trim(d.kontakt), '')),
  email = COALESCE(NULLIF(trim(k.email), ''), NULLIF(trim(d.email), '')),
  telefon = COALESCE(NULLIF(trim(k.telefon), ''), NULLIF(trim(d.telefon), '')),
  website = COALESCE(NULLIF(trim(k.website), ''), NULLIF(trim(d.website), '')),
  plz = COALESCE(NULLIF(trim(k.plz), ''), NULLIF(trim(d.plz), '')),
  strasse = COALESCE(NULLIF(trim(k.strasse), ''), NULLIF(trim(d.strasse), '')),
  notiz = COALESCE(NULLIF(trim(k.notiz), ''), NULLIF(trim(d.notiz), '')),
  region = COALESCE(NULLIF(trim(k.region), ''), NULLIF(trim(d.region), '')),
  besonderheit = COALESCE(NULLIF(trim(k.besonderheit), ''), NULLIF(trim(d.besonderheit), '')),
  touches = COALESCE(k.touches, '[]'::jsonb) || COALESCE(d.touches, '[]'::jsonb),
  status = CASE
    WHEN COALESCE(k.status, 'neu') = 'neu'
      AND COALESCE(d.status, 'neu') <> 'neu' THEN d.status
    ELSE k.status
  END,
  followup = CASE
    WHEN COALESCE(k.followup, '') = '' AND COALESCE(d.followup, '') <> '' THEN d.followup
    ELSE k.followup
  END,
  status_changed_at = CASE
    WHEN COALESCE(k.status, 'neu') = 'neu'
      AND COALESCE(d.status, 'neu') <> 'neu'
      AND COALESCE(d.status_changed_at, '') <> '' THEN d.status_changed_at
    ELSE k.status_changed_at
  END,
  gewerk = 'Hausverwaltung',
  synced_at = now()
FROM pairs p
JOIN public.crm_contacts d ON d.id = p.drop_id
WHERE k.id = p.keep_id;

-- Phase C: Gewerk für alle Hausverwaltungs-Leads normalisieren
UPDATE public.crm_contacts
SET gewerk = 'Hausverwaltung', synced_at = now()
WHERE gewerk IS DISTINCT FROM 'Hausverwaltung'
  AND gewerk ILIKE 'hausverwaltung';

-- Phase D: redundante Gelbe-Seiten-Duplikate löschen
DELETE FROM public.crm_contacts
WHERE id IN (
  'immo_006', 'immo_028', 'immo_027', 'immo_011', 'immo_004',
  'immo_040', 'immo_015', 'immo_030', 'immo_077'
);

COMMIT;

-- ── VERIFY ──────────────────────────────────────────────────
-- SELECT gewerk, COUNT(*) FROM crm_contacts
-- WHERE gewerk ILIKE '%hausverwaltung%' GROUP BY gewerk;
-- Erwartung: eine Zeile, gewerk = Hausverwaltung, count ~138
