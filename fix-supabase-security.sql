-- ================================================================
-- Supabase Security Hardening Migration
-- Run this in Supabase Dashboard → SQL Editor to fix all 9 warnings!
-- ================================================================

-- ── 1. Secure pgvector Extension ────────────────────────────────
-- Move the vector extension out of the public schema to the extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;


-- ── 2. Secure SECURITY DEFINER Functions ─────────────────────────
-- Revoke public execution privileges from SECURITY DEFINER trigger functions conditionally if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_auth_user' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO postgres, service_role, supabase_admin;';
  END IF;
END $$;



-- ── 3. Drop Insecure Permissive Policies ──────────────────────────
-- Remove the overly permissive allow_all_* policies (USING true / CHECK true)
DROP POLICY IF EXISTS "allow_all_users" ON public.users;
DROP POLICY IF EXISTS "allow_all_questions" ON public.questions;
DROP POLICY IF EXISTS "allow_all_messages" ON public.messages;
DROP POLICY IF EXISTS "allow_all_knowledge_base" ON public.knowledge_base;
DROP POLICY IF EXISTS "allow_all_notifications" ON public.notifications;
DROP POLICY IF EXISTS "allow_all_allowed_emails" ON public.allowed_emails;
DROP POLICY IF EXISTS "allow_all_scheduled_messages" ON public.scheduled_messages;


-- ── 4. Verify RLS is Enabled ─────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;


-- ── 5. Create Secure Target RLS Policies ──────────────────────────
-- Note: The Node.js backend connects using the 'service_role' key,
-- which automatically bypasses RLS. We only define SELECT policies 
-- here to allow the frontend client (under the 'authenticated' role) 
-- to fetch its own data and subscribe to Realtime updates safely.

-- A. Users Policy: Authenticated users can view their own profile
CREATE POLICY "users_select_policy" ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_id);

-- B. Questions Policy: Authenticated users can view their own questions
CREATE POLICY "questions_select_policy" ON public.questions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE public.users.id = public.questions.user_id 
      AND public.users.auth_id = auth.uid()
    )
  );

-- C. Notifications Policy: Authenticated users can view their own notifications
CREATE POLICY "notifications_select_policy" ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE public.users.id = public.notifications.user_id 
      AND public.users.auth_id = auth.uid()
    )
  );

-- D. Scheduled Messages Policy: Authenticated users can view their own scheduled messages
CREATE POLICY "scheduled_messages_select_policy" ON public.scheduled_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.auth_id = auth.uid()
      AND (
        public.users.role = 'md'
        OR public.scheduled_messages.chat_id LIKE '%' || public.users.id::text || '%'
      )
    )
  );

-- Note: The 'messages', 'knowledge_base', and 'allowed_emails' tables have RLS enabled with 
-- NO public/authenticated policies. This keeps them fully protected from 
-- direct client access while letting the backend query them using service_role.

-- ✅ Hardening complete! Run this once in the Supabase SQL Editor.

