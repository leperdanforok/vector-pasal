-- Migration 062: Add work_id + optional work scope to match_legal_chunks (vector RPC)
--
-- Two additions for the legal-validity layer:
--   1. Return `work_id` so every vector match can be joined to a work for validity
--      tagging (the FTS RPC search_legal_chunks already returns work_id; this one did not).
--   2. Add optional `filter_work_id` so the validity force-fetch can scope retrieval to a
--      repealed work's in-corpus successor, reusing the same query embedding.
--
-- Changing the RETURNS TABLE shape requires DROP + CREATE (CREATE OR REPLACE cannot change
-- output columns). This file MUST be applied atomically (one transaction) — the DROP takes
-- an ACCESS EXCLUSIVE lock, so concurrent chat calls block until COMMIT and then see the new
-- function; there is no window where the function is missing. Apply this migration BEFORE
-- deploying the route changes that read work_id.

DROP FUNCTION IF EXISTS public.match_legal_chunks(vector, double precision, integer);

CREATE FUNCTION public.match_legal_chunks(
    query_embedding vector,
    match_threshold double precision,
    match_count integer,
    filter_work_id integer DEFAULT NULL
)
 RETURNS TABLE(
    chunk_id bigint,
    node_id bigint,
    work_id integer,
    content text,
    metadata jsonb,
    similarity double precision
 )
 LANGUAGE sql
 STABLE
AS $function$
  select
    dn.id as chunk_id,
    dn.id as node_id,
    dn.work_id as work_id,
    dn.content_text as content,
    jsonb_build_object(
      'type', rt.code,
      'number', w.number,
      'year', w.year::text,
      'pasal', dn.number
    ) as metadata,
    1 - (dn.embedding <=> query_embedding) as similarity
  from document_nodes dn
  join works w on dn.work_id = w.id
  join regulation_types rt on w.regulation_type_id = rt.id
  where dn.embedding is not null
    and 1 - (dn.embedding <=> query_embedding) > match_threshold
    and (filter_work_id is null or dn.work_id = filter_work_id)
  order by dn.embedding <=> query_embedding
  limit match_count;
$function$;
