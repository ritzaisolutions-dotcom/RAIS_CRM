-- Sequence runner: allow service_role, skip missing contacts, business-day delays.

CREATE OR REPLACE FUNCTION sales.run_due_sequence_steps()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = sales, public
AS $$
DECLARE
  enr sales.sequence_enrollments%ROWTYPE;
  step sales.sequence_steps%ROWTYPE;
  next_step sales.sequence_steps%ROWTYPE;
  ran int := 0;
  today date := sales.business_today();
  note text;
  v_email text;
  v_phone text;
  v_next date;
BEGIN
  IF NOT (auth.role() = 'service_role' OR sales.is_app_user()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR enr IN
    SELECT * FROM sales.sequence_enrollments
    WHERE status = 'aktiv'
      AND next_run_on IS NOT NULL
      AND next_run_on <= today
    ORDER BY next_run_on
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO step
    FROM sales.sequence_steps
    WHERE sequence_id = enr.sequence_id
    ORDER BY step_order
    OFFSET enr.current_step
    LIMIT 1;

    IF NOT FOUND THEN
      UPDATE sales.sequence_enrollments
      SET status = 'fertig', next_run_on = NULL
      WHERE id = enr.id;
      CONTINUE;
    END IF;

    IF step.kanal = 'email' THEN
      SELECT p.email INTO v_email
      FROM sales.people p
      WHERE p.id = enr.person_id;
      IF v_email IS NULL OR trim(v_email) = '' THEN
        SELECT p.email INTO v_email
        FROM sales.people p
        WHERE p.company_id = enr.company_id
          AND p.email IS NOT NULL
          AND trim(p.email) <> ''
        ORDER BY p.ist_entscheider DESC, p.created_at
        LIMIT 1;
      END IF;

      IF v_email IS NULL OR trim(v_email) = '' THEN
        PERFORM sales.log_touch(
          enr.company_id,
          'email'::sales.touch_kanal,
          'kein_ergebnis'::sales.touch_ergebnis,
          enr.person_id,
          'Sequenz-Schritt übersprungen: keine E-Mail-Adresse',
          NULL,
          NULL,
          NULL
        );
      ELSE
        note := 'Sequenz-Schritt: E-Mail'
          || COALESCE(E'\nBetreff: ' || NULLIF(trim(step.subject), ''), '')
          || COALESCE(E'\n' || NULLIF(trim(step.body), ''), '');
        INSERT INTO sales.email_messages (
          company_id, person_id, direction, to_email, subject, body, status
        )
        VALUES (
          enr.company_id,
          enr.person_id,
          'outbound',
          trim(v_email),
          COALESCE(NULLIF(trim(step.subject), ''), 'Sequenz'),
          COALESCE(NULLIF(trim(step.body), ''), ''),
          'queued'
        );
        PERFORM sales.log_touch(
          enr.company_id,
          'email'::sales.touch_kanal,
          'kein_ergebnis'::sales.touch_ergebnis,
          enr.person_id,
          note,
          NULL,
          NULL,
          NULL
        );
      END IF;
    ELSIF step.kanal = 'sms' THEN
      SELECT COALESCE(p.telefon, c.telefon) INTO v_phone
      FROM sales.companies c
      LEFT JOIN sales.people p ON p.id = enr.person_id
      WHERE c.id = enr.company_id;
      IF v_phone IS NULL OR trim(v_phone) = '' THEN
        PERFORM sales.log_touch(
          enr.company_id,
          'sms'::sales.touch_kanal,
          'kein_ergebnis'::sales.touch_ergebnis,
          enr.person_id,
          'Sequenz-Schritt übersprungen: keine Telefonnummer',
          NULL,
          NULL,
          NULL
        );
      ELSE
        note := 'Sequenz-Schritt: SMS'
          || COALESCE(E'\n' || NULLIF(trim(step.body), ''), '');
        INSERT INTO sales.sms_messages (
          company_id, person_id, direction, to_phone, body, status
        )
        VALUES (
          enr.company_id,
          enr.person_id,
          'outbound',
          trim(v_phone),
          COALESCE(NULLIF(trim(step.body), ''), ''),
          'queued'
        );
        PERFORM sales.log_touch(
          enr.company_id,
          'sms'::sales.touch_kanal,
          'kein_ergebnis'::sales.touch_ergebnis,
          enr.person_id,
          note,
          NULL,
          NULL,
          NULL
        );
      END IF;
    ELSIF step.kanal = 'call' THEN
      PERFORM sales.create_task(
        enr.company_id,
        COALESCE(NULLIF(trim(step.task_titel), ''), 'Sequenz: Anrufen'),
        today,
        enr.person_id,
        'Sequenz-Schritt: Call',
        'follow_up',
        NULL,
        true
      );
    ELSE
      PERFORM sales.create_task(
        enr.company_id,
        COALESCE(NULLIF(trim(step.task_titel), ''), 'Sequenz-Aufgabe'),
        today,
        enr.person_id,
        COALESCE(NULLIF(trim(step.body), ''), 'Sequenz-Schritt: Aufgabe'),
        'sonstiges',
        NULL,
        false
      );
    END IF;

    SELECT * INTO next_step
    FROM sales.sequence_steps
    WHERE sequence_id = enr.sequence_id
    ORDER BY step_order
    OFFSET enr.current_step + 1
    LIMIT 1;

    IF FOUND THEN
      -- Business-day advance: skip Sat/Sun on the due date.
      v_next := today + next_step.delay_days;
      WHILE EXTRACT(ISODOW FROM v_next) >= 6 LOOP
        v_next := v_next + 1;
      END LOOP;
      UPDATE sales.sequence_enrollments
      SET current_step = enr.current_step + 1,
          next_run_on = v_next
      WHERE id = enr.id;
    ELSE
      UPDATE sales.sequence_enrollments
      SET current_step = enr.current_step + 1,
          status = 'fertig',
          next_run_on = NULL
      WHERE id = enr.id;
    END IF;

    ran := ran + 1;
  END LOOP;

  RETURN ran;
END;
$$;

REVOKE ALL ON FUNCTION sales.run_due_sequence_steps() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales.run_due_sequence_steps()
  TO authenticated, service_role;
