/**
 * Auth Middleware — Supabase JWT Verification
 * ============================================
 * Verifies Supabase-issued access tokens sent in the Authorization header.
 * Attaches the full user profile from public.users to req.user.
 *
 * Token flow:
 *   1. Frontend calls supabase.auth.signInWithPassword()
 *   2. Gets back { access_token, user }
 *   3. Sends: Authorization: Bearer <access_token> to all API calls
 *   4. This middleware verifies the token via Supabase Admin API
 *      and fetches role/name from public.users
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Use admin client so we can call auth.admin.getUser() without RLS restrictions
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Verify token with Supabase — returns the auth user
    const { data: { user: authUser }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !authUser) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Fetch full profile from public.users (contains role, name)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('users')
      .select('id, role, name, email')
      .eq('auth_id', authUser.id)
      .single();

    if (profileErr || !profile) {
      // Fallback: read role/name from user_metadata if profile not found
      const meta = authUser.user_metadata || {};
      req.user = {
        id:    authUser.id,
        email: authUser.email,
        role:  meta.role  || 'employee',
        name:  meta.name  || authUser.email,
      };
    } else {
      req.user = profile;
    }

    next();
  } catch (err) {
    console.error('[Auth] Token verification error:', err.message);
    return res.status(403).json({ error: 'Authentication failed' });
  }
}

export function authorizeRole(roles = []) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized role access' });
    }
    next();
  };
}
