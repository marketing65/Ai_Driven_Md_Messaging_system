-- ================================================================
-- Supabase Vector Search RPC Function
-- Run this in Supabase SQL Editor AFTER running schema.sql
-- ================================================================

-- match_knowledge_base: cosine similarity search on embeddings
-- Called by the backend as: supabase.rpc('match_knowledge_base', { query_embedding, match_count })

CREATE OR REPLACE FUNCTION match_knowledge_base (
  query_embedding vector(1536),
  match_count     int DEFAULT 5
)
RETURNS TABLE (
  id         UUID,
  question   TEXT,
  answer     TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    id,
    question,
    answer,
    1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge_base
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding ASC
  LIMIT match_count;
$$;
