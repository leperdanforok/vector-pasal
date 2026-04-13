-- Migration 057: Fix match_legal_chunks RPC for vector embedding search
--
-- The match_legal_chunks function was used by the /api/chat route to answer questions
-- but it broke when legal_chunks was dropped in migration 038.
-- We now point this function directly to the `embedding` column on `document_nodes`.

CREATE OR REPLACE FUNCTION public.match_legal_chunks(query_embedding vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(chunk_id bigint, node_id bigint,  content text, metadata jsonb, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  select
    dn.id as chunk_id,
    dn.id as node_id,
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
  order by dn.embedding <=> query_embedding
  limit match_count;
$function$;
