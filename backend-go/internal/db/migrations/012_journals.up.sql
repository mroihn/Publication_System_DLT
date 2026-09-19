-- Multiple journals, each in one subject category. Authors pick a target
-- journal at submission; its category drives automatic editor assignment.

-- Subject taxonomy. Same 5 slugs already used by verified_fields and the
-- on-chain manuscript field, now with a canonical home.
CREATE TABLE IF NOT EXISTS categories (
    slug  TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

INSERT INTO categories (slug, label) VALUES
  ('ai',                'AI'),
  ('computer-security', 'Computer Security'),
  ('blockchain',        'Blockchain'),
  ('cloud-computing',   'Cloud Computing'),
  ('data-science',      'Data Science')
ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label;

-- Several journals may share one category.
CREATE TABLE IF NOT EXISTS journals (
    id            SERIAL PRIMARY KEY,
    name          TEXT   NOT NULL UNIQUE,
    category_slug TEXT   NOT NULL REFERENCES categories(slug),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_journals_category ON journals(category_slug);

INSERT INTO journals (name, category_slug) VALUES
  ('Journal of Applied AI',           'ai'),
  ('Journal of Machine Intelligence', 'ai'),
  ('Journal of Blockchain Systems',   'blockchain'),
  ('Ledger and Trust Review',         'blockchain'),
  ('Journal of Computer Security',    'computer-security'),
  ('Cloud Infrastructure Journal',    'cloud-computing'),
  ('Journal of Data Science',         'data-science')
ON CONFLICT (name) DO UPDATE SET category_slug = EXCLUDED.category_slug;

-- Author's chosen journal, mirrored by the indexer from the signed on-chain metadata.
ALTER TABLE manuscripts ADD COLUMN IF NOT EXISTS journal_id INT REFERENCES journals(id);

-- Editor picked automatically from the journal's category at submission time.
ALTER TABLE manuscripts ADD COLUMN IF NOT EXISTS assigned_editor_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_manuscripts_assigned_editor ON manuscripts(assigned_editor_id);

-- The editor seeded in 007 has no categories, so nothing would ever match it.
-- Make it the generalist covering every category.
UPDATE users
SET verified_fields = ARRAY['ai','computer-security','blockchain','cloud-computing','data-science'],
    updated_at      = NOW()
WHERE email = 'editor@desci.local';

-- Category-specific demo editors (password: editor123), re-applied on every
-- startup like the seeded reviewers in 008.
INSERT INTO users (id, email, password_hash, role, verified_fields, updated_at)
VALUES
  (gen_random_uuid(), 'editor.ai@desci.local',
   '$2a$10$Hj.vvyBv/bFrlvQ3P/N/Ne.Qej7XGIHur87h5IhMY/QIU3YXBA17G', 'editor',
   ARRAY['ai'], NOW()),
  (gen_random_uuid(), 'editor.chain@desci.local',
   '$2a$10$Hj.vvyBv/bFrlvQ3P/N/Ne.Qej7XGIHur87h5IhMY/QIU3YXBA17G', 'editor',
   ARRAY['blockchain','computer-security'], NOW()),
  (gen_random_uuid(), 'editor.data@desci.local',
   '$2a$10$Hj.vvyBv/bFrlvQ3P/N/Ne.Qej7XGIHur87h5IhMY/QIU3YXBA17G', 'editor',
   ARRAY['data-science','cloud-computing'], NOW())
ON CONFLICT (email) DO UPDATE SET
  password_hash   = EXCLUDED.password_hash,
  role            = EXCLUDED.role,
  verified_fields = EXCLUDED.verified_fields,
  updated_at      = NOW();
