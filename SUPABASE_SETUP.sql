-- Run this once in your Supabase SQL editor (Dashboard → SQL Editor → New query)

CREATE TABLE IF NOT EXISTS scm_ct_data (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Allow anonymous reads and writes (your anon key is the only auth needed)
ALTER TABLE scm_ct_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read"  ON scm_ct_data FOR SELECT USING (true);
CREATE POLICY "anon_write" ON scm_ct_data FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update" ON scm_ct_data FOR UPDATE USING (true);

-- Index for fast key lookups (already primary key, but explicit for clarity)
-- No extra index needed — PK covers it.
