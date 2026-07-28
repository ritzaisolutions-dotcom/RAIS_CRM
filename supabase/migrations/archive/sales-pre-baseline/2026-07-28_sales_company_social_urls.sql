-- Company Instagram / Facebook URLs + list views
ALTER TABLE sales.companies
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text;
