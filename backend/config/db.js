/**
 * Database Layer — Supabase JS Client
 * =====================================
 * Uses @supabase/supabase-js with service_role key as the primary DB interface.
 * This works on ALL networks (HTTPS port 443) unlike raw pg which needs port 5432/6543.
 *
 * Provides a `query(sql, params)` interface identical to the old pg wrapper
 * so all existing route files work without changes.
 */

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSqlite = false; // Always Supabase mode

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('[DB] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env');
  process.exit(1);
}

// Admin client — service_role bypasses RLS, full DB access
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
  db:   { schema: 'public' },
});

console.log('[DB] Using Supabase JS client (service_role) via HTTPS');

// ─────────────────────────────────────────────────────────────────
// query() — PostgreSQL-compatible wrapper using Supabase REST API
// ─────────────────────────────────────────────────────────────────
// Maps raw SQL + params to equivalent supabase-js calls so all
// existing route files (`query('SELECT ...', [id])`) keep working.
//
// Supported patterns:
//   SELECT * FROM table WHERE col = $1
//   INSERT INTO table (...) VALUES (...) RETURNING *
//   UPDATE table SET col = $1 WHERE id = $2
//   DELETE FROM table WHERE id = $1
// ─────────────────────────────────────────────────────────────────

export async function query(sql, params = []) {
  // Substitute $1, $2, ... placeholders with actual values for parsing
  let resolvedSql = sql;
  params.forEach((val, i) => {
    // Replace placeholder but keep original param array for actual execution
    resolvedSql = resolvedSql.replace(new RegExp(`\\$${i + 1}`, 'g'), '__P__');
  });

  const trimmed = sql.trim().replace(/\s+/g, ' ');
  const upper   = trimmed.toUpperCase();

  // ── Raw pass-through via Supabase RPC for complex queries ─────
  // For simpler CRUD patterns, use supabase-js builder for reliability
  try {
    // ── SELECT ──────────────────────────────────────────────────
    if (upper.startsWith('SELECT')) {
      return await handleSelect(trimmed, params);
    }

    // ── INSERT ──────────────────────────────────────────────────
    if (upper.startsWith('INSERT')) {
      return await handleInsert(trimmed, params);
    }

    // ── UPDATE ──────────────────────────────────────────────────
    if (upper.startsWith('UPDATE')) {
      return await handleUpdate(trimmed, params);
    }

    // ── DELETE ──────────────────────────────────────────────────
    if (upper.startsWith('DELETE')) {
      return await handleDelete(trimmed, params);
    }

    // ── DDL / Extensions — use RPC ────────────────────────────
    if (upper.startsWith('CREATE') || upper.startsWith('ALTER') ||
        upper.startsWith('DROP')   || upper.startsWith('GRANT') ||
        upper.startsWith('REVOKE')) {
      // DDL not supported via REST — log and skip silently
      console.log('[DB] DDL skipped (tables managed via schema.sql):', trimmed.slice(0, 60));
      return { rows: [] };
    }

    console.warn('[DB] Unhandled query pattern:', trimmed.slice(0, 80));
    return { rows: [] };

  } catch (err) {
    console.error('[DB] Query error:', err.message, '| SQL:', trimmed.slice(0, 100));
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────
// SELECT handler
// ──────────────────────────────────────────────────────────────────
async function handleSelect(sql, params) {
  // Extract table name
  const fromMatch = sql.match(/FROM\s+([\w]+)/i);
  if (!fromMatch) throw new Error(`Cannot parse table from: ${sql}`);
  const table = fromMatch[1].toLowerCase();

  // Build supabase query
  let q = supabase.from(table).select('*');

  // Parse WHERE conditions
  q = applyWhereFilters(q, sql, params);

  // ORDER BY
  const orderMatch = sql.match(/ORDER BY\s+([\w.]+)\s*(ASC|DESC)?/i);
  if (orderMatch) {
    const col = orderMatch[1].includes('.') ? orderMatch[1].split('.')[1] : orderMatch[1];
    q = q.order(col, { ascending: (orderMatch[2] || 'ASC').toUpperCase() === 'ASC' });
  }

  // LIMIT
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    q = q.limit(parseInt(limitMatch[1]));
  }

  // count(*) shorthand
  if (/SELECT\s+count\(\*\)/i.test(sql)) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) throw error;
    return { rows: [{ count: String(count) }] };
  }

  // JOIN query — use RPC for complex joins (questions with users)
  if (/JOIN/i.test(sql)) {
    return await handleJoinQuery(sql, params, table);
  }

  const { data, error } = await q;
  if (error) throw error;
  return { rows: data ?? [] };
}

// ──────────────────────────────────────────────────────────────────
// INSERT handler
// ──────────────────────────────────────────────────────────────────
async function handleInsert(sql, params) {
  const tableMatch = sql.match(/INSERT INTO\s+([\w]+)\s*\(([^)]+)\)/i);
  if (!tableMatch) throw new Error(`Cannot parse INSERT: ${sql}`);

  const table   = tableMatch[1].toLowerCase();
  const columns = tableMatch[2].split(',').map(c => c.trim().replace(/"/g, ''));

  const record = {};
  columns.forEach((col, i) => {
    record[col] = params[i] ?? null;
  });

  const returning = /RETURNING/i.test(sql);
  const { data, error } = await supabase.from(table).insert(record).select();
  if (error) throw error;

  return { rows: data ?? [] };
}

// ──────────────────────────────────────────────────────────────────
// UPDATE handler
// ──────────────────────────────────────────────────────────────────
async function handleUpdate(sql, params) {
  const tableMatch = sql.match(/UPDATE\s+([\w]+)\s+SET/i);
  if (!tableMatch) throw new Error(`Cannot parse UPDATE: ${sql}`);
  const table = tableMatch[1].toLowerCase();

  // Extract SET columns: SET col1 = $1, col2 = $2
  const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
  if (!setMatch) throw new Error(`Cannot parse SET clause: ${sql}`);

  const setParts = setMatch[1].split(',').map(s => s.trim());
  const updates  = {};
  let paramIdx   = 0;

  for (const part of setParts) {
    const colMatch = part.match(/([\w]+)\s*=\s*\$(\d+)/);
    if (colMatch) {
      const paramPos = parseInt(colMatch[2]) - 1;
      let val = params[paramPos];
      // Handle ::vector cast
      if (typeof val === 'string' && part.includes('::vector')) {
        // Store as-is (supabase handles pgvector)
      }
      updates[colMatch[1]] = val;
    }
  }

  // WHERE clause filters
  let q = supabase.from(table).update(updates);
  const whereParams = extractWhereParams(sql, params);
  for (const { col, val } of whereParams) {
    q = q.eq(col, val);
  }

  const { data, error } = await q.select();
  if (error) throw error;
  return { rows: data ?? [] };
}

// ──────────────────────────────────────────────────────────────────
// DELETE handler
// ──────────────────────────────────────────────────────────────────
async function handleDelete(sql, params) {
  const tableMatch = sql.match(/DELETE FROM\s+([\w]+)/i);
  if (!tableMatch) throw new Error(`Cannot parse DELETE: ${sql}`);
  const table = tableMatch[1].toLowerCase();

  let q = supabase.from(table).delete();
  const whereParams = extractWhereParams(sql, params);
  for (const { col, val } of whereParams) {
    q = q.eq(col, val);
  }

  const { error } = await q;
  if (error) throw error;
  return { rows: [] };
}

// ──────────────────────────────────────────────────────────────────
// JOIN query handler (questions JOIN users)
// ──────────────────────────────────────────────────────────────────
async function handleJoinQuery(sql, params, table) {
  // questions JOIN users is the only join in this app
  // Build it as a nested select
  let q = supabase.from('questions').select(`
    *,
    users!questions_user_id_fkey ( name, email )
  `);

  // Apply WHERE filters
  const statusMatch = sql.match(/q\.status\s*=\s*\$(\d+)/i);
  if (statusMatch) {
    q = q.eq('status', params[parseInt(statusMatch[1]) - 1]);
  }

  const priorityMatch = sql.match(/q\.priority\s*=\s*\$(\d+)/i);
  if (priorityMatch) {
    q = q.eq('priority', params[parseInt(priorityMatch[1]) - 1]);
  }

  const userIdMatch = sql.match(/q\.user_id\s*=\s*\$(\d+)/i);
  if (userIdMatch) {
    q = q.eq('user_id', params[parseInt(userIdMatch[1]) - 1]);
  }

  // ORDER BY
  const orderMatch = sql.match(/ORDER BY\s+q\.([\w]+)\s*(ASC|DESC)?/i);
  if (orderMatch) {
    q = q.order(orderMatch[1], { ascending: (orderMatch[2] || 'ASC').toUpperCase() === 'ASC' });
  }

  const { data, error } = await q;
  if (error) throw error;

  // Flatten nested user fields to match old JOIN format (employee_name, employee_email)
  const rows = (data ?? []).map(r => ({
    ...r,
    employee_name:  r.users?.name  ?? null,
    employee_email: r.users?.email ?? null,
    users: undefined,
  }));

  return { rows };
}

// ──────────────────────────────────────────────────────────────────
// WHERE clause parser for Supabase query builder
// ──────────────────────────────────────────────────────────────────
function applyWhereFilters(q, sql, params) {
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER BY|\s+LIMIT|$)/is);
  if (!whereMatch) return q;

  const whereClause = whereMatch[1].trim();

  // 1. Complex OR queries (analytics search)
  if (/question\s+LIKE\s+\$(\d+)\s+OR\s+answer\s+LIKE\s+\$(\d+)/i.test(whereClause)) {
    const m = whereClause.match(/question\s+LIKE\s+\$(\d+)\s+OR\s+answer\s+LIKE\s+\$(\d+)/i);
    const pIdx = parseInt(m[1]) - 1;
    const term = params[pIdx];
    return q.or(`question.ilike.${term},answer.ilike.${term}`);
  }

  if (/\(question_original\s+LIKE\s+\$(\d+)\s+OR\s+answer\s+LIKE\s+\$(\d+)\)\s+AND\s+status\s*=\s*'answered'/i.test(whereClause)) {
    const m = whereClause.match(/\(question_original\s+LIKE\s+\$(\d+)\s+OR\s+answer\s+LIKE\s+\$(\d+)\)/i);
    const pIdx = parseInt(m[1]) - 1;
    const term = params[pIdx];
    return q.eq('status', 'answered').or(`question_original.ilike.${term},answer.ilike.${term}`);
  }

  // 2. Standard AND conditions
  const parts = whereClause.split(/\s+AND\s+/i);

  for (let part of parts) {
    part = part.trim();
    if (part.startsWith('(') && part.endsWith(')')) {
      part = part.substring(1, part.length - 1).trim();
    }

    // col = $N
    const eqParamMatch = part.match(/^(?:[\w.]+\.)?([\w]+)\s*=\s*\$(\d+)$/);
    if (eqParamMatch) {
      const col = eqParamMatch[1];
      const pIdx = parseInt(eqParamMatch[2]) - 1;
      q = q.eq(col, params[pIdx]);
      continue;
    }

    // col = 'literal'
    const eqLiteralMatch = part.match(/^(?:[\w.]+\.)?([\w]+)\s*=\s*'([^']*)'$/);
    if (eqLiteralMatch) {
      const col = eqLiteralMatch[1];
      const val = eqLiteralMatch[2];
      q = q.eq(col, val);
      continue;
    }

    // col LIKE 'literal'
    const likeLiteralMatch = part.match(/^(?:[\w.]+\.)?([\w]+)\s+LIKE\s+'([^']*)'$/i);
    if (likeLiteralMatch) {
      const col = likeLiteralMatch[1];
      const val = likeLiteralMatch[2];
      q = q.like(col, val);
      continue;
    }

    // col LIKE $N
    const likeParamMatch = part.match(/^(?:[\w.]+\.)?([\w]+)\s+LIKE\s+\$(\d+)$/i);
    if (likeParamMatch) {
      const col = likeParamMatch[1];
      const pIdx = parseInt(likeParamMatch[2]) - 1;
      q = q.like(col, params[pIdx]);
      continue;
    }

    // col IS NOT NULL
    const isNotNullMatch = part.match(/^(?:[\w.]+\.)?([\w]+)\s+IS\s+NOT\s+NULL$/i);
    if (isNotNullMatch) {
      const col = isNotNullMatch[1];
      q = q.not(col, 'is', null);
      continue;
    }

    if (part === '1=1') {
      continue;
    }

    console.warn('[DB] Unknown WHERE condition clause:', part);
  }

  return q;
}

// ──────────────────────────────────────────────────────────────────
// WHERE clause parser — extracts col=val pairs from $N params
// ──────────────────────────────────────────────────────────────────
function extractWhereParams(sql, params) {
  const result = [];
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER BY|\s+LIMIT|$)/is);
  if (!whereMatch) return result;

  const whereClause = whereMatch[1];
  // Match patterns like: col = $N  OR  alias.col = $N
  const condRegex = /(?:[\w]+\.)?([\w]+)\s*=\s*\$(\d+)/g;
  let m;
  while ((m = condRegex.exec(whereClause)) !== null) {
    const col    = m[1];
    const pIndex = parseInt(m[2]) - 1;
    if (pIndex < params.length) {
      result.push({ col, val: params[pIndex] });
    }
  }
  return result;
}

// ──────────────────────────────────────────────────────────────────
// Database Initializer & Seeder
// ──────────────────────────────────────────────────────────────────
export async function initializeDatabase() {
  console.log('[DB] Verifying Supabase tables...');

  // Check tables exist via supabase admin
  let tables, error;
  try {
    const res = await supabase
      .from('users')
      .select('id')
      .limit(1);
    tables = res.data;
    error = res.error;
  } catch (fetchErr) {
    console.error('\n❌ [DB] Supabase Connection Failure:');
    console.error(`   Error details: ${fetchErr.message}`);
    console.error(`\n💡 Tip 1: Your Supabase project "${SUPABASE_URL}" might be paused or deleted.`);
    console.error('   Free-tier projects are auto-paused by Supabase after 1 week of inactivity.');
    console.error('   Please log in to https://supabase.com/dashboard and click "Restore Project" if it is paused.');
    console.error('\n💡 Tip 2: If you created a new project, verify that the project URL and keys in backend/.env and frontend/.env match the new project.');
    throw new Error('Supabase project is unreachable.');
  }

  if (error) {
    if (error.message && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('ENOTFOUND'))) {
      console.error('\n❌ [DB] Supabase Connection Failure:');
      console.error(`   Error details: ${error.message}`);
      console.error(`\n💡 Tip 1: Your Supabase project "${SUPABASE_URL}" might be paused or deleted.`);
      console.error('   Free-tier projects are auto-paused by Supabase after 1 week of inactivity.');
      console.error('   Please log in to https://supabase.com/dashboard and click "Restore Project" if it is paused.');
      console.error('\n💡 Tip 2: If you created a new project, verify that the project URL and keys in backend/.env and frontend/.env match the new project.');
      throw new Error('Supabase project is unreachable.');
    }

    console.error('[DB] Cannot reach users table:', error.message);
    console.error('[DB] → Did you run schema.sql in Supabase SQL Editor?');
    throw new Error('Database tables not found. Run schema.sql first.');
  }

  console.log('[DB] ✓ Tables verified');

  // Seed initial data if empty
  const { count } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  if (count === 0) {
    console.log('[DB] Seeding initial users...');
    const hashedPw = await bcrypt.hash('password123', 10);

    await supabase.from('users').insert([
      { role: 'employee', name: 'Ravi Kumar',     email: 'ravi@company.com', password_hash: hashedPw },
      { role: 'md',       name: 'Dr. Amit Sharma', email: 'amit@company.com', password_hash: hashedPw },
    ]);

    // Seed knowledge base
    console.log('[DB] Seeding knowledge base...');
    const kbSeed = [
      { question: 'How to fix motor vibration issue?',          answer: 'Check the alignment of the motor and pump. Tighten all loose bolts. Check the bearing condition. Balance the rotating parts.' },
      { question: 'Machine overheating problem, what to do?',   answer: 'Verify coolant levels are optimal. Clean the radiator vents. Check for electrical blockages. Reduce load if operational parameters are exceeded.' },
      { question: 'What is the procedure for sensor calibration?', answer: 'Power down the sensor unit. Apply a standard reference signal. Adjust the offset screw until output matches reference. Save changes.' },
    ];

    const { getEmbedding } = await import('./openai-embed.js').catch(() => ({ getEmbedding: null }));
    // Fall back to services/openai.js if no separate embed file
    const { getEmbedding: getEmbedding2 } = await import('../services/openai.js');
    const embedFn = getEmbedding ?? getEmbedding2;

    for (const entry of kbSeed) {
      console.log(`[DB]   Embedding: "${entry.question.slice(0, 40)}..."`);
      try {
        const embedding = await embedFn(entry.question + ' ' + entry.answer);
        await supabase.from('knowledge_base').insert({
          question:  entry.question,
          answer:    entry.answer,
          embedding: `[${embedding.join(',')}]`,
        });
      } catch (e) {
        console.warn('[DB]   Embedding failed (non-fatal):', e.message);
        await supabase.from('knowledge_base').insert({
          question: entry.question,
          answer:   entry.answer,
        });
      }
    }

    console.log('[DB] ✓ Seeding complete');
  } else {
    console.log(`[DB] Database already has ${count} user(s) — skipping seed`);
  }

  // Repair embeddings on startup
  await repairEmbeddings();

  // Create scheduled_messages table
  await ensureScheduledMessagesTable();

  // Create allowed_emails table
  await ensureAllowedEmailsTable();

  // Create avatar_url column in users table
  await ensureAvatarUrlColumn();
}

// ──────────────────────────────────────────────────────────────────
// Create scheduled_messages table if not exists
// ──────────────────────────────────────────────────────────────────
async function ensureScheduledMessagesTable() {
  const { Client } = pg;
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    
    const tableExistsRes = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE  table_schema = 'public'
        AND    table_name   = 'scheduled_messages'
      );
    `);
    
    if (!tableExistsRes.rows[0].exists) {
      await client.query(`
        CREATE TABLE scheduled_messages (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          chat_id    VARCHAR(100) NOT NULL,
          sender     VARCHAR(20)  NOT NULL CHECK (sender IN ('employee', 'md')),
          message    TEXT NOT NULL,
          send_at    TIMESTAMP WITH TIME ZONE NOT NULL,
          sent       BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      try {
        await client.query(`
          ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
        `);
      } catch (rlsErr) {
        console.warn('[DB] Could not enable RLS on scheduled_messages (might require superuser/owner):', rlsErr.message);
      }
    }
    
    console.log('[DB] ✓ scheduled_messages table ensured');
  } catch (err) {
    console.error('[DB] Error creating scheduled_messages table:', err.message);
  } finally {
    await client.end();
  }
}

// ──────────────────────────────────────────────────────────────────
// Create allowed_emails table if not exists, and seed defaults
// ──────────────────────────────────────────────────────────────────
async function ensureAllowedEmailsTable() {
  const { Client } = pg;
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    
    const tableExistsRes = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE  table_schema = 'public'
        AND    table_name   = 'allowed_emails'
      );
    `);
    
    if (!tableExistsRes.rows[0].exists) {
      await client.query(`
        CREATE TABLE allowed_emails (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email      VARCHAR(255) UNIQUE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      try {
        await client.query(`
          ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;
        `);
      } catch (rlsErr) {
        console.warn('[DB] Could not enable RLS on allowed_emails (might require superuser/owner):', rlsErr.message);
      }
    }
    
    // Seed default whitelisted emails if the table is completely empty
    const checkRes = await client.query("SELECT COUNT(*) FROM allowed_emails");
    if (parseInt(checkRes.rows[0].count) === 0) {
      console.log('[DB] Seeding default allowed_emails...');
      await client.query(`
        INSERT INTO allowed_emails (email) VALUES 
        ('ravi@company.com'),
        ('amit@company.com'),
        ('marketing@akashblowers.com'),
        ('ai@akashblowers.com')
        ON CONFLICT (email) DO NOTHING;
      `);
    }
    
    console.log('[DB] ✓ allowed_emails table ensured');
  } catch (err) {
    console.error('[DB] Error creating allowed_emails table:', err.message);
  } finally {
    await client.end();
  }
}

// ──────────────────────────────────────────────────────────────────
// Embedding repair
// ──────────────────────────────────────────────────────────────────
async function repairEmbeddings() {
  try {
    const { data: rows } = await supabase
      .from('knowledge_base')
      .select('id, question, answer, embedding');

    if (!rows || rows.length === 0) return;

    const { getEmbedding } = await import('../services/openai.js');
    console.log(`[DB] Re-generating embeddings for ${rows.length} KB entries...`);

    for (const row of rows) {
      const embedding = await getEmbedding(row.question + ' ' + row.answer);
      await supabase.from('knowledge_base').update({
        embedding: `[${embedding.join(',')}]`,
      }).eq('id', row.id);
    }

    console.log(`[DB] ✓ All ${rows.length} embeddings refreshed`);
  } catch (err) {
    console.warn('[DB] Embedding repair failed (non-fatal):', err.message);
  }
}

// ──────────────────────────────────────────────────────────────────
// Create avatar_url column in users table if not exists
// ──────────────────────────────────────────────────────────────────
async function ensureAvatarUrlColumn() {
  const { Client } = pg;
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    const colExistsRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='avatar_url';
    `);
    
    if (colExistsRes.rows.length === 0) {
      console.log('[DB] Adding avatar_url column to users table...');
      await client.query(`
        ALTER TABLE users ADD COLUMN avatar_url TEXT;
      `);
      console.log('[DB] ✓ avatar_url column added successfully');
    } else {
      console.log('[DB] ✓ users.avatar_url column already exists');
    }

    // Force PostgREST schema cache reload so Supabase API detects the new column
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("[DB] ✓ Sent schema reload notification to PostgREST");
  } catch (err) {
    console.error('[DB] Error checking/adding avatar_url column:', err.message);
  } finally {
    await client.end();
  }
}
