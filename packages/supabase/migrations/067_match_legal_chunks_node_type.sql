-- Migration 067: Add node_type to match_legal_chunks (vector RPC) metadata
--
-- The Lampiran fix introduces `lampiran_tarif` nodes whose `number` looks like "I.54" /
-- "II.12.1", not an Arabic Pasal number. The chat route renders a citation header from
-- metadata ("[Perda No N/YYYY, Pasal X]") and detects cited sources by Pasal number — both
-- need to know whether a row is a Pasal or a Lampiran. The metadata jsonb carried no node_type,
-- so the route had no deterministic way to tell them apart.
--
-- This adds `node_type` to the returned metadata. The RETURNS TABLE shape is unchanged (only
-- the jsonb_build_object content changes), so this is a plain CREATE OR REPLACE — no DROP, no
-- missing-function window. Backward-compatible: existing callers ignore the extra key.

CREATE OR REPLACE FUNCTION public.match_legal_chunks(
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
      'pasal', dn.number,
      'node_type', dn.node_type
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
