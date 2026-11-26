-- Start-Vorlagen für die Makler-Akquise.
-- Platzhalter: {{vorname}}, {{nachname}}, {{name}}, {{firma}}, {{stadt}},
-- {{website}}, {{absender}}; Fallback per {{vorname|Ersatz}}.
-- Bestehende Vorlagen mit gleichem Namen werden nicht überschrieben.

INSERT INTO sales.email_templates (name, subject, body)
SELECT v.name, v.subject, v.body
FROM (VALUES
  (
    'Nicht erreicht – kurze Vorstellung',
    'Kurz zu Ihren Anfragen bei {{firma}}',
    $t$Guten Tag {{name|zusammen}},

ich habe heute versucht, Sie telefonisch zu erreichen – leider ohne Erfolg, deshalb kurz per Mail.

Ich bin {{absender}} von RAIS. Wir helfen Maklerbüros wie {{firma}}, eingehende Anfragen schneller vorzuqualifizieren, damit Sie nur noch die Gespräche führen, die sich lohnen.

Hätten Sie diese oder nächste Woche 15 Minuten für ein kurzes Telefonat? Antworten Sie einfach mit einem Zeitfenster, das Ihnen passt.

Viele Grüße
{{absender}}
RAIS – Ritz AI Solutions$t$
  ),
  (
    'Nach Gespräch – Zusammenfassung',
    'Unser Gespräch – nächste Schritte für {{firma}}',
    $t$Hallo {{vorname|zusammen}},

danke für das angenehme Gespräch heute.

Kurz zusammengefasst:
- Ausgangslage: [bitte ergänzen]
- Wo es hakt: [bitte ergänzen]
- Nächster Schritt: [bitte ergänzen]

Ich melde mich wie besprochen am [Datum]. Wenn vorher Fragen aufkommen, erreichen Sie mich jederzeit unter dieser Adresse.

Viele Grüße
{{absender}}$t$
  ),
  (
    'Terminbestätigung',
    'Bestätigung: unser Termin',
    $t$Hallo {{vorname|zusammen}},

hiermit bestätige ich unseren Termin am [Datum] um [Uhrzeit].

Damit wir die Zeit gut nutzen, schauen wir uns gemeinsam an, wie bei {{firma}} Anfragen heute reinkommen und wo am meisten Zeit verloren geht.

Falls sich etwas verschiebt, geben Sie mir einfach kurz Bescheid.

Bis dahin
{{absender}}$t$
  ),
  (
    'Follow-up nach 1 Woche',
    'Kurze Nachfrage',
    $t$Hallo {{vorname|zusammen}},

ich wollte mich kurz zu meiner letzten Nachricht zurückmelden. Ist das Thema Anfragen-Qualifizierung bei {{firma}} gerade relevant – oder eher später im Jahr?

Eine kurze Antwort reicht mir, dann weiß ich, wann ich mich wieder melden darf.

Viele Grüße
{{absender}}$t$
  ),
  (
    'Info-Mail (allgemein)',
    'Informationen zu RAIS',
    $t$Guten Tag,

wie gewünscht sende ich Ihnen kurz die wichtigsten Informationen zu RAIS.

Wir sorgen dafür, dass Interessenten-Anfragen strukturiert erfasst und vorqualifiziert werden, bevor Sie zurückrufen. Das spart Ihnen Zeit für Besichtigungen und Gespräche mit Interessenten, die wirklich passen.

Wenn Sie mögen, zeige ich Ihnen das in 15 Minuten am Telefon. Antworten Sie einfach auf diese Mail.

Viele Grüße
RAIS – Ritz AI Solutions$t$
  ),
  (
    'Nach Absage – Tür offen lassen',
    'Danke für Ihre Rückmeldung',
    $t$Hallo {{vorname|zusammen}},

danke für Ihre ehrliche Rückmeldung – völlig in Ordnung.

Ich melde mich in ein paar Monaten noch einmal kurz. Sollte sich bei {{firma}} vorher etwas ändern, erreichen Sie mich jederzeit unter dieser Adresse.

Alles Gute und viele Grüße
{{absender}}$t$
  )
) AS v(name, subject, body)
WHERE NOT EXISTS (
  SELECT 1 FROM sales.email_templates t WHERE lower(t.name) = lower(v.name)
);
