-- The legacy `tier` column (VARCHAR(8)) now stores the manuscript field slug,
-- which can exceed 8 chars (e.g. 'computer-security'). Widen it.
ALTER TABLE reviewer_sessions ALTER COLUMN tier TYPE TEXT;
