-- Seed 3 pre-verified demo reviewers (all specializations) with fixed wallets.
-- Re-applied on every startup: DO UPDATE keeps them in the verified state and
-- restores their credentials/fields even if changed.
INSERT INTO users (id, email, password_hash, wallet_address, role, specialities, verified_fields, updated_at)
VALUES
  (gen_random_uuid(), 'rev1@mail.com', '$2a$10$yBeQ1waxxEGhqRIRyv1Hf.ScTdeopjFr0IlMekeyK1GsvSV.JgBMi',
   '0x3fcb91b1ba0214647227f6d5ae57bdfe95500b8b', 'reviewer',
   ARRAY['ai','computer-security','blockchain','cloud-computing','data-science'],
   ARRAY['ai','computer-security','blockchain','cloud-computing','data-science'], NOW()),
  (gen_random_uuid(), 'rev2@mail.com', '$2a$10$acO.7wvFXhSmeLMPm3tdZuKs.kt5Gbk3wxB2IBODKdjhst6LwA.8W',
   '0xfcdc925d3c852df9192a0aa842911570da581d91', 'reviewer',
   ARRAY['ai','computer-security','blockchain','cloud-computing','data-science'],
   ARRAY['ai','computer-security','blockchain','cloud-computing','data-science'], NOW()),
  (gen_random_uuid(), 'rev3@mail.com', '$2a$10$.1mp5gkSvQ2EXPUazwzacu2vzrP0ai6vpluTrxC/B8G40tjm4PexO',
   '0x3732822cb27698b0b1a5137af4141d9d5b2853e3', 'reviewer',
   ARRAY['ai','computer-security','blockchain','cloud-computing','data-science'],
   ARRAY['ai','computer-security','blockchain','cloud-computing','data-science'], NOW())
ON CONFLICT (email) DO UPDATE SET
  password_hash   = EXCLUDED.password_hash,
  wallet_address  = EXCLUDED.wallet_address,
  role            = EXCLUDED.role,
  specialities    = EXCLUDED.specialities,
  verified_fields = EXCLUDED.verified_fields,
  updated_at      = NOW();
