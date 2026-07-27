/**
 * Supabase Admin Client (Backend)
 * ================================
 * Uses the Service Role key — has full DB access, bypasses RLS.
 * Use ONLY on the backend (server-side). Never expose this key to the browser.
 *
 * Usage:
 *   import supabase from './config/supabase.js';
 *   const { data, error } = await supabase.from('users').select('*');
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey   = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.warn('[Supabase] SUPABASE_URL not set in .env — Supabase client disabled');
}

// Admin client (Service Role) — bypasses RLS, for backend use only
export const supabaseAdmin = supabaseUrl && supabaseServiceKey && supabaseServiceKey !== 'your_service_role_key_here'
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    })
  : null;

// Anon client — respects RLS policies, safe for limited backend use
export const supabaseAnon = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    })
  : null;

// Default export is the admin client (most backend operations need it)
export default supabaseAdmin;

/**
 * Test the Supabase connection (call once on startup)
 */
export async function testSupabaseConnection() {
  if (!supabaseAdmin) {
    console.log('[Supabase] Admin client not configured — skipping connection test');
    return false;
  }
  try {
    const { error } = await supabaseAdmin.from('users').select('count').limit(1);
    if (error) throw error;
    console.log('[Supabase] ✓ Connection verified');
    return true;
  } catch (err) {
    console.warn(`[Supabase] Connection test failed: ${err.message}`);
    return false;
  }
}
