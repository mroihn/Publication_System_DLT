ALTER TABLE processed_events ADD COLUMN IF NOT EXISTS ms_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_processed_events_ms_id ON processed_events(ms_id) WHERE ms_id IS NOT NULL;
