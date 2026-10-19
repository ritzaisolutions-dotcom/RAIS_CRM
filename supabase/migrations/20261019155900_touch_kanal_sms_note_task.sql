-- New timeline channels for Close-style shared history.
-- Separate migration so values are committed before functions use them.

DO $$ BEGIN
  ALTER TYPE sales.touch_kanal ADD VALUE 'sms';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE sales.touch_kanal ADD VALUE 'note';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE sales.touch_kanal ADD VALUE 'task';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
