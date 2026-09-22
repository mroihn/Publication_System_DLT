DROP INDEX IF EXISTS idx_manuscript_assignments_editor;
DROP TABLE IF EXISTS manuscript_assignments;

DELETE FROM users WHERE email IN (
  'editor.ai@desci.local', 'editor.chain@desci.local', 'editor.data@desci.local'
);

DROP INDEX IF EXISTS idx_journals_category;
DROP TABLE IF EXISTS journals;
DROP TABLE IF EXISTS categories;
