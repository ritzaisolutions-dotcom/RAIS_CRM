-- Standard-Wiedervorlage von set_pipeline_status (übermorgen bzw. +3 Monate
-- bei „Später“) rollt Wochenenden auf Montag – wie die Presets im Client.

CREATE OR REPLACE FUNCTION sales.next_weekday(d date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT d + CASE extract(isodow FROM d)::int WHEN 6 THEN 2 WHEN 7 THEN 1 ELSE 0 END;
$$;

DO $migration$
DECLARE
  src text;
BEGIN
  src := pg_get_functiondef('sales.set_pipeline_status(uuid,sales.pipeline_status,sales.touch_kanal,date)'::regprocedure);
  src := replace(
    src,
    $old$CASE
      WHEN p_pipeline_status::text = 'later'
        THEN (sales.business_today() + interval '3 months')::date
      ELSE (sales.business_today() + 2)::date
    END$old$,
    $new$sales.next_weekday(CASE
      WHEN p_pipeline_status::text = 'later'
        THEN (sales.business_today() + interval '3 months')::date
      ELSE (sales.business_today() + 2)::date
    END)$new$
  );
  IF position('sales.next_weekday' IN src) = 0 THEN
    RAISE EXCEPTION 'set_pipeline_status: Standard-Wiedervorlage nicht gefunden';
  END IF;
  EXECUTE src;
END;
$migration$;
