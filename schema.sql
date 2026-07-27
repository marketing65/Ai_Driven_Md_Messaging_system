-- ================================================================
-- MD Knowledge Intelligence System — Supabase Schema
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- ── 1. Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 2. Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('employee', 'md')),
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 3. Questions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_original   TEXT NOT NULL,
    question_normalized TEXT NOT NULL,
    answer              TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'answered')),
    priority            VARCHAR(10) NOT NULL DEFAULT 'medium'
                            CHECK (priority IN ('low', 'medium', 'high')),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    answered_at         TIMESTAMP WITH TIME ZONE
);

-- ── 4. Messages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id    VARCHAR(100) NOT NULL,
    sender     VARCHAR(20)  NOT NULL CHECK (sender IN ('employee', 'ai', 'md')),
    message    TEXT NOT NULL,
    type       VARCHAR(10)  NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'voice')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 5. Knowledge Base (pgvector RAG) ────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_base (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question   TEXT NOT NULL,
    answer     TEXT NOT NULL,
    embedding  vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 6. Notifications ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    read_status BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── 7. Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS notifications_user_idx    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS questions_user_status_idx ON questions(user_id, status);
CREATE INDEX IF NOT EXISTS messages_chat_idx         ON messages(chat_id);

-- Vector index (requires at least 1 row to build — skip if you get an error here,
-- the backend will still work; add it later after seeding)
-- CREATE INDEX IF NOT EXISTS knowledge_base_embedding_idx
--     ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── 8. Row Level Security ────────────────────────────────────────
-- This app uses its own JWT auth, NOT Supabase Auth.
-- Backend uses service_role key which AUTOMATICALLY bypasses all RLS.
-- These open policies allow the service_role to work correctly.
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;

-- Open policies for all tables (service_role bypasses these anyway,
-- but they are needed so the connection doesn't silently block rows)
CREATE POLICY "allow_all_users"          ON users          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_questions"      ON questions      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_messages"       ON messages       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_knowledge_base" ON knowledge_base FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_notifications"  ON notifications  FOR ALL USING (true) WITH CHECK (true);

-- ── 9. Enable Realtime ───────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE questions;

-- ── 10. Scheduled Messages ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id    VARCHAR(100) NOT NULL,
    sender     VARCHAR(20)  NOT NULL CHECK (sender IN ('employee', 'md')),
    message    TEXT NOT NULL,
    send_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    sent       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_scheduled_messages" ON scheduled_messages FOR ALL USING (true) WITH CHECK (true);

-- ── 11. Whitelisted Emails ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS allowed_emails (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_allowed_emails" ON allowed_emails FOR ALL USING (true) WITH CHECK (true);

-- Seed initial allowed emails
INSERT INTO allowed_emails (email) VALUES 
('ravi@company.com'),
('amit@company.com'),
('marketing@akashblowers.com'),
('ai@akashblowers.com')
ON CONFLICT (email) DO NOTHING;

-- ✅ Schema complete! Now start the backend with: npm run dev
