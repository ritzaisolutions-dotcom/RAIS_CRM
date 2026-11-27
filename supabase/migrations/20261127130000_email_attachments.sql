-- PDF-Dokumente (z. B. Broschüre), die beim E-Mail-Versand angehängt werden.

-- 1) Privater Speicher: nur PDF, max. 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sales-documents', 'sales-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

drop policy if exists sales_documents_select on storage.objects;
create policy sales_documents_select on storage.objects
  for select to authenticated
  using (bucket_id = 'sales-documents' and (select sales.is_app_user()));

drop policy if exists sales_documents_insert on storage.objects;
create policy sales_documents_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sales-documents' and (select sales.is_app_user()));

drop policy if exists sales_documents_delete on storage.objects;
create policy sales_documents_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'sales-documents' and (select sales.is_app_user()));

-- 2) Bibliothek der Anhänge (Soft-Deactivate statt Löschen, damit alte Mails nachvollziehbar bleiben).
create table if not exists sales.email_attachments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  storage_path text not null unique check (char_length(storage_path) <= 500),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

alter table sales.email_attachments enable row level security;

drop policy if exists email_attachments_all on sales.email_attachments;
create policy email_attachments_all on sales.email_attachments
  for all to authenticated
  using ((select sales.is_app_user()))
  with check ((select sales.is_app_user()));

grant select, insert, update on sales.email_attachments to authenticated;

-- 3) Anhänge an Vorlagen (Standard) und an versendeten Mails.
alter table sales.email_templates
  add column if not exists attachment_ids uuid[] not null default '{}';
alter table sales.email_messages
  add column if not exists attachment_ids uuid[] not null default '{}';
