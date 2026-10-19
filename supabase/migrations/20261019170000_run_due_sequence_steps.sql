-- Advance due sequence enrollments (Europe/Berlin via sales.business_today).

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
BEGIN
  IF NOT sales.is_app_user() THEN
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
      note := 'Sequenz-Schritt: E-Mail'
        || COALESCE(E'\nBetreff: ' || NULLIF(trim(step.subject), ''), '')
        || COALESCE(E'\n' || NULLIF(trim(step.body), ''), '');
      INSERT INTO sales.email_messages (
        company_id, person_id, direction, to_email, subject, body, status
      )
      SELECT
        enr.company_id,
        enr.person_id,
        'outbound',
        COALESCE(p.email, 'unbekannt@local'),
        COALESCE(NULLIF(trim(step.subject), ''), 'Sequenz'),
        COALESCE(NULLIF(trim(step.body), ''), ''),
        'queued'
      FROM (SELECT 1) _
      LEFT JOIN sales.people p ON p.id = enr.person_id;
      PERFORM sales.log_touch(
        enr.company_id,
        'email'::sales.touch_kanal,
        'kein_ergebnis'::sales.touch_ergebnis,
        enr.person_id,
        note,
        NULL,
        NULL
      );
    ELSIF step.kanal = 'sms' THEN
      note := 'Sequenz-Schritt: SMS'
        || COALESCE(E'\n' || NULLIF(trim(step.body), ''), '');
      INSERT INTO sales.sms_messages (
        company_id, person_id, direction, to_phone, body, status
      )
      SELECT
        enr.company_id,
        enr.person_id,
        'outbound',
        COALESCE(p.telefon, c.telefon, 'unbekannt'),
        COALESCE(NULLIF(trim(step.body), ''), ''),
        'queued'
      FROM sales.companies c
      LEFT JOIN sales.people p ON p.id = enr.person_id
      WHERE c.id = enr.company_id;
      PERFORM sales.log_touch(
        enr.company_id,
        'sms'::sales.touch_kanal,
        'kein_ergebnis'::sales.touch_ergebnis,
        enr.person_id,
        note,
        NULL,
        NULL
      );
    ELSIF step.kanal = 'call' THEN
      PERFORM sales.create_task(
        enr.company_id,
        COALESCE(NULLIF(trim(step.task_titel), ''), 'Sequenz: Anrufen'),
        today,
        enr.person_id,
        'Sequenz-Schritt: Call'
      );
    ELSE
      -- task
      PERFORM sales.create_task(
        enr.company_id,
        COALESCE(NULLIF(trim(step.task_titel), ''), 'Sequenz-Aufgabe'),
        today,
        enr.person_id,
        COALESCE(NULLIF(trim(step.body), ''), 'Sequenz-Schritt: Aufgabe')
      );
    END IF;

    SELECT * INTO next_step
    FROM sales.sequence_steps
    WHERE sequence_id = enr.sequence_id
    ORDER BY step_order
    OFFSET enr.current_step + 1
    LIMIT 1;

    IF FOUND THEN
      UPDATE sales.sequence_enrollments
      SET current_step = enr.current_step + 1,
          next_run_on = (today + next_step.delay_days)::date
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

GRANT EXECUTE ON FUNCTION sales.run_due_sequence_steps() TO authenticated;
