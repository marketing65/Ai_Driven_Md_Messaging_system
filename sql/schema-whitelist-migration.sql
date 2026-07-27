-- ================================================================
-- Whitelisted Emails Security Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- ── 1. Create Allowed Emails Table ───────────────────────────────
CREATE TABLE IF NOT EXISTS allowed_emails (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 2. Enable RLS and add bypass policy ──────────────────────────
ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_allowed_emails ON allowed_emails;
CREATE POLICY allow_all_allowed_emails ON allowed_emails FOR ALL USING (true) WITH CHECK (true);

-- ── 3. Seed Default Whitelisted Users ────────────────────────────
INSERT INTO allowed_emails (email) VALUES 
('ravi@company.com'),
('amit@company.com'),
('marketing@akashblowers.com'),
('ai@akashblowers.com')
ON CONFLICT (email) DO NOTHING;

-- ✅ Migration complete! Whitelist security is now active.
