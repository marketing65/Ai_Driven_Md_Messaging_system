-- ================================================================
-- Supabase Auth Migration (FINAL - Run in SQL Editor)
-- ================================================================

-- ── 1. Add auth_id column to link public.users ↔ auth.users ─────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE;

-- ── 2. Index for fast lookup ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS users_auth_id_idx ON public.users(auth_id);

-- ── 3. Auto-sync trigger: when new auth user → create public.users row
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (auth_id, email, name, role, password_hash)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name',  split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role',  'employee'),
    '[managed-by-supabase-auth]'
  )
  ON CONFLICT (email) DO UPDATE
    SET auth_id = EXCLUDED.auth_id,
        name    = COALESCE(EXCLUDED.name, public.users.name),
        role    = COALESCE(EXCLUDED.role, public.users.role);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ✅ Done! The trigger will auto-link new signups.
-- Existing users (ravi, amit) will get linked when they register via the app.
