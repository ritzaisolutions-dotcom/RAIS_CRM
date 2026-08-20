-- Rollback: Session Tracker Tables
-- Run this to undo 2026-05-22_create_sessions_tables.sql
DROP TABLE IF EXISTS crm_session_events;
DROP TABLE IF EXISTS crm_sessions;
DROP FUNCTION IF EXISTS update_updated_at();
