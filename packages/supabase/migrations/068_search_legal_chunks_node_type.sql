-- Migration 068: Add node_type to search_legal_chunks (FTS RPC) metadata
--
-- Companion to migration 067 (which added node_type to the vector RPC). The chat route needs
-- node_type on every retrieved row to (a) render "[... Lampiran I.54]" vs "[... Pasal 56]" and
-- (b) detect cited Lampiran sources. This threads dn.node_type (aliased `nt`) through the CTE
-- pipeline and adds it to the final metadata jsonb.
--
-- Body is migration 065 (which added 'lampiran_tarif' to v_node_types) + node_type threading.
-- Signature and RETURNS TABLE shape are unchanged -> plain CREATE OR REPLACE. 068 supersedes
-- 065's function definition; append-only.

CREATE OR REPLACE FUNCTION search_legal_chunks(
    query_text TEXT,
    match_count INT DEFAULT 10,
    metadata_filter JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    id BIGINT,
    work_id INTEGER,
    content TEXT,
    metadata JSONB,
    score FLOAT,
    snippet TEXT
)
LANGUAGE sql
STABLE
SET search_path = 'public', 'extensions'
AS $$
WITH p AS (
    SELECT
        trim(regexp_replace(regexp_replace(query_text, '[^a-zA-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) AS v_safe,
        CASE WHEN metadata_filter ? 'year' THEN (metadata_filter ->> 'year')::int ELSE NULL END AS v_year_filter,
        CASE WHEN metadata_filter ? 'year_from' THEN (metadata_filter ->> 'year_from')::int ELSE NULL END AS v_year_from,
        CASE WHEN metadata_filter ? 'work_id' THEN (metadata_filter ->> 'work_id')::int ELSE NULL END AS v_work_filter,
        CASE WHEN metadata_filter ->> 'type' IS NOT NULL AND metadata_filter ->> 'type' != ''
            THEN string_to_array(metadata_filter ->> 'type', ',') ELSE NULL END AS v_type_filters,
        CASE WHEN metadata_filter ->> 'status' IS NOT NULL AND metadata_filter ->> 'status' != ''
            THEN string_to_array(metadata_filter ->> 'status', ',') ELSE NULL END AS v_status_filters,
        ARRAY['pasal','ayat','preamble','penjelasan_umum','penjelasan_pasal','bagian','paragraf','bab','lampiran_tarif'] AS v_node_types,
        to_tsquery('indonesian', 'denda | pidana | sanksi | kurungan | ancaman') AS v_sanction_tsq,
        COALESCE(
            websearch_to_tsquery('indonesian', trim(regexp_replace(regexp_replace(query_text, '[^a-zA-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))),
            plainto_tsquery('indonesian', trim(regexp_replace(regexp_replace(query_text, '[^a-zA-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')))
        ) AS v_tsquery
),
and_m AS (
    SELECT dn.id, dn.work_id AS wid, dn.content_text, dn.fts, dn.number AS pno, dn.node_type AS nt,
           w.year AS wy, w.number AS wno, rt.code AS rc, rt.hierarchy_level AS rl, 2.0::float AS boost
    FROM document_nodes dn
    JOIN works w ON w.id = dn.work_id
    JOIN regulation_types rt ON rt.id = w.regulation_type_id, p
    WHERE dn.fts @@ p.v_tsquery AND dn.node_type = ANY(p.v_node_types) AND dn.content_text IS NOT NULL
      AND (p.v_type_filters IS NULL OR rt.code = ANY(p.v_type_filters))
      AND (p.v_year_filter IS NULL OR w.year = p.v_year_filter)
      AND (p.v_year_from IS NULL OR w.year >= p.v_year_from)
      AND (p.v_status_filters IS NULL OR w.status = ANY(p.v_status_filters))
      AND (p.v_work_filter IS NULL OR dn.work_id = p.v_work_filter)
    LIMIT 100
),
or_m AS (
    SELECT dn.id, dn.work_id AS wid, dn.content_text, dn.fts, dn.number AS pno, dn.node_type AS nt,
           w.year AS wy, w.number AS wno, rt.code AS rc, rt.hierarchy_level AS rl, 1.0::float AS boost
    FROM document_nodes dn
    JOIN works w ON w.id = dn.work_id
    JOIN regulation_types rt ON rt.id = w.regulation_type_id, p
    WHERE (SELECT bool_or(dn.fts @@ plainto_tsquery('indonesian', word)) FROM unnest(string_to_array(p.v_safe, ' ')) AS word WHERE length(word) > 3)
      AND dn.node_type = ANY(p.v_node_types) AND dn.content_text IS NOT NULL
      AND (p.v_type_filters IS NULL OR rt.code = ANY(p.v_type_filters))
      AND (p.v_year_filter IS NULL OR w.year = p.v_year_filter)
      AND (p.v_year_from IS NULL OR w.year >= p.v_year_from)
      AND (p.v_status_filters IS NULL OR w.status = ANY(p.v_status_filters))
      AND (p.v_work_filter IS NULL OR dn.work_id = p.v_work_filter)
    LIMIT 100
),
mw AS (SELECT wid FROM and_m UNION SELECT wid FROM or_m),
combined AS (SELECT * FROM and_m UNION ALL SELECT * FROM or_m),
dedup AS (SELECT DISTINCT ON (id) * FROM combined ORDER BY id, boost DESC),
scored AS (
    SELECT d.*,
        (ts_rank_cd(d.fts, p.v_tsquery) * d.boost
         * (1.0 + (10 - COALESCE(d.rl, 5)) * 0.05)
         * (1.0 + GREATEST(0, COALESCE(d.wy, 2000) - 1990) * 0.005))::float AS fts_score,
        word_similarity(p.v_safe, LEFT(d.content_text, 2000))::float AS trgm_score
    FROM dedup d, p
),
rk AS (
    SELECT s.*,
        (1.0 / (60 + ROW_NUMBER() OVER (ORDER BY s.fts_score DESC))
         + 0.4 / (60 + ROW_NUMBER() OVER (ORDER BY s.trgm_score DESC)))::float AS rrf_score
    FROM scored s
),
top_main AS (SELECT * FROM rk ORDER BY rrf_score DESC LIMIT (match_count - 3)),
top_main_ids AS (SELECT id FROM top_main),
sanctions AS (
    SELECT dn.id, dn.work_id AS wid, dn.content_text, dn.fts, dn.number AS pno, dn.node_type AS nt,
           w.year AS wy, w.number AS wno, rt.code AS rc,
           ts_rank_cd(dn.fts, p.v_sanction_tsq) * 200.0 AS rrf_score
    FROM document_nodes dn
    JOIN works w ON w.id = dn.work_id
    JOIN regulation_types rt ON rt.id = w.regulation_type_id, p
    WHERE dn.work_id IN (SELECT wid FROM mw)
      AND dn.fts @@ p.v_sanction_tsq
      AND dn.node_type = ANY(p.v_node_types)
      AND dn.content_text IS NOT NULL
      AND dn.id NOT IN (SELECT id FROM top_main_ids)
      AND (p.v_work_filter IS NULL OR dn.work_id = p.v_work_filter)
    ORDER BY ts_rank_cd(dn.fts, p.v_sanction_tsq) DESC
    LIMIT 3
),
final AS (
    SELECT id::bigint, wid::integer, content_text, rc, wno, wy, pno, nt, fts, rrf_score, 'main' AS src FROM top_main
    UNION ALL
    SELECT id::bigint, wid::integer, content_text, rc, wno, wy, pno, nt, fts, rrf_score, 'sanction' AS src FROM sanctions
)
SELECT
    f.id,
    f.wid,
    f.content_text,
    jsonb_build_object('type', f.rc, 'number', f.wno, 'year', f.wy::text, 'pasal', f.pno, 'node_type', f.nt),
    f.rrf_score,
    COALESCE(
        ts_headline('indonesian', LEFT(f.content_text, 1000), p.v_tsquery,
            'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, MaxFragments=1'),
        LEFT(f.content_text, 200)
    )
FROM final f, p
ORDER BY f.src DESC, f.rrf_score DESC;
$$;
