/**
 * Supabase Browser Client (Frontend)
 * ====================================
 * Uses the Anon/Publishable key — respects Row Level Security (RLS).
 * Safe to use in the browser.
 *
 * Import in any React component:
 *   import supabase from '../lib/supabase.js';
 *
 * Real-time subscription example:
 *   const channel = supabase
 *     .channel('notifications')
 *     .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' },
 *         (payload) => console.log('New notification:', payload.new))
 *     .subscribe();
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  console.warn('[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set in .env');
}

const supabase = createClient(supabaseUrl, supabaseAnon, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export default supabase;
