DROP INDEX IF EXISTS idx_processed_events_ms_id;
ALTER TABLE processed_events DROP COLUMN IF EXISTS ms_id;
