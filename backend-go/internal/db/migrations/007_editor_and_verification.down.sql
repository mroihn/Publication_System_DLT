DELETE FROM users WHERE email = 'editor@desci.local';
DROP TABLE IF EXISTS reviewer_field_requests;
ALTER TABLE manuscripts DROP COLUMN IF EXISTS field;
ALTER TABLE users DROP COLUMN IF EXISTS verified_fields;
