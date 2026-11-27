-- Listen-Ansicht bekommt dieselben neuen Spalten wie v_leads (icp, notion_id).
CREATE OR REPLACE VIEW sales.v_leads_by_list WITH (security_invoker = true) AS
 SELECT v.company_id, v.firma, v.person_id, v.entscheider, v.stadt, v.crm, v."anfragen/woche",
    v.naechster_touch, v.status, v.relationship, v.kategorie, v.tage_seit_touch, v.letzter_touch_am,
    v.letzter_kanal, v.letzter_kontakt_kanal, v.letzter_kontakt_am, v.vorheriger_kontakt_kanal,
    v.tel, v.firma_telefon, v.email, v.person_linkedin_url, v.linkedin_company_url, v.linkedin_url,
    v.inserate_aktiv, v.mitarbeiterzahl, v.meta_ads, v.website, v.instagram_url, v.facebook_url,
    v.xing_url, v.youtube_url, v.tiktok_url, v.quelle, v.quell_url, v.created_at, v.kontaktversuche,
    v.opp_stage,
    m.list_id,
    v.icp,
    v.notion_id
   FROM sales.v_leads v
     JOIN sales.lead_list_members m ON m.company_id = v.company_id;
