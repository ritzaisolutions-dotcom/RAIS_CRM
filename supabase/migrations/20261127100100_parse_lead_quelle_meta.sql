-- CSV-Import erkennt „Meta“, „Facebook“ und „Instagram“ als Quelle Meta.
CREATE OR REPLACE FUNCTION sales.parse_lead_quelle(p_text text)
RETURNS sales.lead_quelle
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN NULL
    WHEN lower(p_text) ~ '(is24|immoscout|immobilienscout)' THEN 'IS24'::sales.lead_quelle
    WHEN lower(p_text) ~ 'immowelt' THEN 'Immowelt'::sales.lead_quelle
    WHEN lower(p_text) ~ 'ivd' THEN 'IVD'::sales.lead_quelle
    WHEN lower(p_text) ~ 'linkedin' THEN 'LinkedIn'::sales.lead_quelle
    WHEN lower(p_text) ~ '(meta|facebook|instagram)' THEN 'Meta'::sales.lead_quelle
    WHEN lower(p_text) ~ '(inbound|website|formular)' THEN 'Inbound Website'::sales.lead_quelle
    WHEN lower(p_text) ~ 'manuell' THEN 'manuell'::sales.lead_quelle
    ELSE NULL
  END
$function$;
