DROP INDEX IF EXISTS idx_manuscripts_assigned_editor;
ALTER TABLE manuscripts DROP COLUMN IF EXISTS assigned_editor_id;
ALTER TABLE manuscripts DROP COLUMN IF EXISTS journal_id;

DELETE FROM users WHERE email IN (
  'editor.ai@desci.local', 'editor.chain@desci.local', 'editor.data@desci.local'
);

DROP INDEX IF EXISTS idx_journals_category;
DROP TABLE IF EXISTS journals;
DROP TABLE IF EXISTS categories;
