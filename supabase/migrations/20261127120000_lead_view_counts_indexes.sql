-- Leads-Liste bei ~1.500+ Leads: Zähler je Ansicht in einer Abfrage + Indizes.
--
-- 1) sales.lead_view_counts(): ersetzt 14 einzelne Kopf-Abfragen (count=exact, head)
--    gegen sales.v_leads durch einen Durchlauf mit count(*) FILTER (...).
--    Die Bedingungen sind 1:1 dieselben wie applyView() in src/lib/sales/leadQueries.ts
--    (PostgREST eq/neq/in = SQL =/<>/IN, d. h. NULL fällt jeweils heraus).
--    Wer hier etwas ändert, ändert LEAD_VIEW_FILTERS (leadViewFilters.ts) mit — der Test
--    src/lib/sales/leadViewFilters.test.ts prüft Schlüssel und Bedingungen gegen LEAD_VIEW_FILTERS.
--
--    SECURITY INVOKER: läuft mit den Rechten des Aufrufers, RLS auf companies/people/
--    touchpoints greift wie bei der direkten View-Abfrage (v_leads ist security_invoker).

create or replace function sales.lead_view_counts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'alle',           count(*) filter (where l.relationship <> 'Ausgeschlossen'
                                         and (l.notion_id is null or l.icp = 'JA')),
    'faellig',        count(*) filter (where l.relationship <> 'Ausgeschlossen'
                                         and l.naechster_touch is not null
                                         and l.naechster_touch <= sales.business_today()),
    'neu',            count(*) filter (where l.relationship = 'Prospect' and l.status = 'neu'
                                         and (l.notion_id is null or l.icp = 'JA')),
    'kontaktiert',    count(*) filter (where l.relationship = 'Prospect' and l.status = 'kontaktiert'),
    'nicht_erreicht', count(*) filter (where l.relationship = 'Prospect'
                                         and l.status in ('kein_anschluss_1','kein_anschluss_2',
                                                          'kein_anschluss_3','kein_anschluss_4',
                                                          'kein_anschluss_5')),
    'rueckruf',       count(*) filter (where l.relationship = 'Prospect' and l.status = 'callback'),
    'spaeter',        count(*) filter (where l.relationship = 'Prospect' and l.status = 'later'),
    'termin',         count(*) filter (where l.relationship = 'Prospect' and l.status = 'set_appointment'),
    'closing',        count(*) filter (where l.relationship = 'Prospect' and l.status = 'closed'),
    'kunden',         count(*) filter (where l.relationship = 'Kunde'),
    'icp_pruefen',    count(*) filter (where l.relationship = 'Prospect'
                                         and l.notion_id is not null
                                         and l.icp in ('Grenzfall','offen')),
    'kein_interesse', count(*) filter (where l.relationship = 'Ausgeschlossen' and l.icp <> 'RAUS'),
    'icp_raus',       count(*) filter (where l.relationship = 'Ausgeschlossen' and l.icp = 'RAUS')
  )
  from sales.v_leads l;
$$;

comment on function sales.lead_view_counts() is
  'Anzahl Leads je Ansicht der Leads-Liste (Schlüssel = LEAD_VIEWS). Bedingungen identisch zu applyView() im Client.';

revoke all on function sales.lead_view_counts() from public, anon;
grant execute on function sales.lead_view_counts() to authenticated;

-- 2) Indizes
-- Ansichten filtern fast immer auf relationship (+ pipeline_status).
create index if not exists companies_relationship_status_idx
  on sales.companies (relationship, pipeline_status);

-- ICP-Ansichten (icp_pruefen / icp_raus / IN_WORK-Filter).
create index if not exists companies_icp_idx
  on sales.companies (icp);

-- Letzter / vorletzter echter Kontakt und contact_attempts() je Firma in v_leads.
create index if not exists touchpoints_company_contact_idx
  on sales.touchpoints (company_id, occurred_at desc)
  where voided_at is null
    and kanal in ('call','email','dm','sms','meeting');
