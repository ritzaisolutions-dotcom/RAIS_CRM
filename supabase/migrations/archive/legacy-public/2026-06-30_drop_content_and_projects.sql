-- Drop Content-Pipeline and Projekte/To-dos (moved to Eckstein CMS / Performance Tracker)
BEGIN;
DROP TABLE IF EXISTS public.crm_todos;
DROP TABLE IF EXISTS public.crm_projects;
DROP TABLE IF EXISTS public.crm_content;
COMMIT;
