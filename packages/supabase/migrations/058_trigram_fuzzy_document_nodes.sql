-- Migration 058: Trigram index and Fuzzy Search for document_nodes
--
-- This enables handling typos like "smpah" (instead of "sampah") 
-- by using pg_trgm similarity logic instead of just FTS.

-- 1. Create index for fast trigram similarity searches
CREATE INDEX IF NOT EXISTS idx_nodes_content_trgm ON document_nodes USING gin(content_text gin_trgm_ops);

-- 2. Update search_legal_chunks to include a dedicated fuzzy layer
-- We add this BEFORE the ILIKE fallback because it's smarter.

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
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_safe TEXT;
    v_type_filters TEXT[];
    v_year_filter INT := CASE WHEN metadata_filter ? 'year'
        THEN (metadata_filter ->> 'year')::int ELSE NULL END;
    v_year_from INT := CASE WHEN metadata_filter ? 'year_from'
        THEN (metadata_filter ->> 'year_from')::int ELSE NULL END;
    v_status_filters TEXT[];
    v_type_id INTEGER;
    v_first_word TEXT;
    v_second_word TEXT;
    v_nums TEXT[];
    v_count INTEGER := 0;
    v_total INTEGER := 0;
    v_tsquery TSQUERY;
    v_node_types TEXT[] := ARRAY[
        'pasal','ayat','preamble','content',
        'aturan','penjelasan_umum','penjelasan_pasal'
    ];
BEGIN
    -- Parse filters (same as 056)
    v_type_filters := CASE
        WHEN metadata_filter ->> 'type' IS NOT NULL AND metadata_filter ->> 'type' != ''
        THEN string_to_array(metadata_filter ->> 'type', ',')
        ELSE NULL
    END;
    v_status_filters := CASE
        WHEN metadata_filter ->> 'status' IS NOT NULL AND metadata_filter ->> 'status' != ''
        THEN string_to_array(metadata_filter ->> 'status', ',')
        ELSE NULL
    END;

    v_safe := regexp_replace(query_text, '[^a-zA-Z0-9 ]', ' ', 'g');
    v_safe := trim(regexp_replace(v_safe, '\s+', ' ', 'g'));
    IF v_safe = '' THEN RETURN; END IF;

    -- ================================================================
    -- Layer 1: Identity & Layer 2: Works FTS (exact match paths)
    -- ================================================================
    -- (Omitted for brevity, assume they run and return if matches found)
    -- actually we must include them in the replace function
    
    -- [Reproduction of Layer 1 & 2 from 056...]
    -- (I'll write the full function to be safe)

    -- Layer 1: Identity
    v_first_word := UPPER(split_part(v_safe, ' ', 1));
    v_second_word := UPPER(COALESCE(NULLIF(split_part(v_safe, ' ', 2), ''), ''));
    SELECT rt.id INTO v_type_id FROM regulation_types rt WHERE rt.code IN (v_first_word, v_first_word || '_' || v_second_word, CASE WHEN v_first_word = 'PERPU' THEN 'PERPPU' ELSE NULL END) ORDER BY CASE rt.code WHEN v_first_word THEN 1 WHEN v_first_word || '_' || v_second_word THEN 2 ELSE 3 END LIMIT 1;
    IF v_type_id IS NULL THEN SELECT sub.type_id INTO v_type_id FROM (SELECT rt.id AS type_id, trim(regexp_replace(regexp_replace(LOWER(rt.name_id), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) AS norm FROM regulation_types rt) sub WHERE LOWER(v_safe) LIKE sub.norm || ' %' OR LOWER(v_safe) = sub.norm ORDER BY length(sub.norm) DESC LIMIT 1; END IF;
    IF v_type_id IS NOT NULL THEN
        SELECT array_agg(m[1]::text) INTO v_nums FROM regexp_matches(v_safe, '(\d+)', 'g') m;
        IF v_nums IS NOT NULL AND array_length(v_nums, 1) > 0 THEN
            RETURN QUERY SELECT dn_rep.id::bigint, w.id, dn_rep.content_text, jsonb_build_object('type', rt.code, 'number', w.number, 'year', w.year::text, 'pasal', dn_rep.node_number), 1000.0::float, LEFT(dn_rep.content_text, 200) FROM works w JOIN regulation_types rt ON rt.id = w.regulation_type_id JOIN LATERAL (SELECT d.id, d.content_text, d.number AS node_number FROM document_nodes d WHERE d.work_id = w.id AND d.content_text IS NOT NULL AND d.node_type = ANY(v_node_types) ORDER BY d.sort_order ASC NULLS LAST LIMIT 1) dn_rep ON true WHERE w.regulation_type_id = v_type_id AND ((array_length(v_nums, 1) >= 2 AND ((w.number = v_nums[1] AND length(v_nums[2]) <= 4 AND w.year = v_nums[2]::int) OR (w.number = v_nums[2] AND length(v_nums[1]) <= 4 AND w.year = v_nums[1]::int))) OR (array_length(v_nums, 1) = 1 AND (w.number = v_nums[1] OR (length(v_nums[1]) <= 4 AND w.year = v_nums[1]::int)))) AND (v_type_filters IS NULL OR rt.code = ANY(v_type_filters)) AND (v_year_filter IS NULL OR w.year = v_year_filter) AND (v_year_from IS NULL OR w.year >= v_year_from) AND (v_status_filters IS NULL OR w.status = ANY(v_status_filters)) LIMIT 3;
            GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
            IF v_count > 0 THEN RETURN; END IF;
        END IF;
    END IF;

    -- Layer 2: Works FTS
    RETURN QUERY SELECT dn_rep.id::bigint, w.id, dn_rep.content_text, jsonb_build_object('type', rt.code, 'number', w.number, 'year', w.year::text, 'pasal', dn_rep.node_number), (ts_rank_cd(w.search_fts, plainto_tsquery('indonesian', v_safe)) * 10.0 * (1.0 + (10 - COALESCE(rt.hierarchy_level, 5)) * 0.05))::float, LEFT(dn_rep.content_text, 200) FROM works w JOIN regulation_types rt ON rt.id = w.regulation_type_id JOIN LATERAL (SELECT d.id, d.content_text, d.number AS node_number FROM document_nodes d WHERE d.work_id = w.id AND d.content_text IS NOT NULL AND d.node_type = ANY(v_node_types) ORDER BY d.sort_order ASC NULLS LAST LIMIT 1) dn_rep ON true WHERE w.search_fts @@ plainto_tsquery('indonesian', v_safe) AND (v_type_filters IS NULL OR rt.code = ANY(v_type_filters)) AND (v_year_filter IS NULL OR w.year = v_year_filter) AND (v_year_from IS NULL OR w.year >= v_year_from) AND (v_status_filters IS NULL OR w.status = ANY(v_status_filters)) ORDER BY 5 DESC LIMIT 5;
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
    IF v_total >= match_count THEN RETURN; END IF;

    -- ================================================================
    -- Layer 3: FTS Search (with Trigram RRF secondary rank)
    -- ================================================================
    v_tsquery := websearch_to_tsquery('indonesian', v_safe);
    IF v_tsquery IS NOT NULL THEN
        RETURN QUERY WITH candidates AS (SELECT dn.id, dn.work_id, dn.content_text, dn.fts, dn.number AS node_number, w.year AS w_year, w.number AS w_number, rt.code AS rt_code, rt.hierarchy_level AS rt_level FROM document_nodes dn JOIN works w ON w.id = dn.work_id JOIN regulation_types rt ON rt.id = w.regulation_type_id WHERE dn.fts @@ v_tsquery AND dn.node_type = ANY(v_node_types) AND dn.content_text IS NOT NULL AND (v_type_filters IS NULL OR rt.code = ANY(v_type_filters)) AND (v_year_filter IS NULL OR w.year = v_year_filter) AND (v_year_from IS NULL OR w.year >= v_year_from) AND (v_status_filters IS NULL OR w.status = ANY(v_status_filters)) LIMIT 500), scored AS (SELECT c.*, (ts_rank_cd(c.fts, v_tsquery) * (1.0 + (10 - COALESCE(c.rt_level, 5)) * 0.05) * (1.0 + GREATEST(0, COALESCE(c.w_year, 2000) - 1990) * 0.005))::float AS fts_score, word_similarity(v_safe, LEFT(c.content_text, 2000))::float AS trgm_score FROM candidates c), ranked AS (SELECT s.*, (1.0 / (60 + ROW_NUMBER() OVER (ORDER BY s.fts_score DESC)) + 0.4 / (60 + ROW_NUMBER() OVER (ORDER BY s.trgm_score DESC)))::float AS rrf_score FROM scored s) SELECT r.id::bigint, r.work_id, r.content_text, jsonb_build_object('type', r.rt_code, 'number', r.w_number, 'year', r.w_year::text, 'pasal', r.node_number), r.rrf_score, ts_headline('indonesian', LEFT(r.content_text, 1000), v_tsquery, 'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, MaxFragments=1') FROM ranked r ORDER BY r.rrf_score DESC LIMIT match_count;
        GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
    END IF;

    -- ================================================================
    -- NEW Layer 4: STANDALONE FUZZY (Trigram)
    -- This handles typos where FTS fails completely.
    -- ================================================================
    IF v_total < match_count THEN
        RETURN QUERY
        WITH fuzzy_candidates AS (
            SELECT
                dn.id,
                dn.work_id,
                dn.content_text,
                dn.number AS node_number,
                w.year AS w_year,
                w.number AS w_number,
                rt.code AS rt_code,
                -- word_similarity uses the trigram index for efficiency
                word_similarity(v_safe, dn.content_text) as sim
            FROM document_nodes dn
            JOIN works w ON w.id = dn.work_id
            JOIN regulation_types rt ON rt.id = w.regulation_type_id
            WHERE dn.content_text %> v_safe  -- Uses trigram index (strict word similarity)
                AND dn.node_type = ANY(v_node_types)
                AND (v_type_filters IS NULL OR rt.code = ANY(v_type_filters))
                AND (v_year_filter IS NULL OR w.year = v_year_filter)
                AND (v_year_from IS NULL OR w.year >= v_year_from)
                AND (v_status_filters IS NULL OR w.status = ANY(v_status_filters))
            ORDER BY sim DESC
            LIMIT 20
        )
        SELECT
            fc.id::bigint,
            fc.work_id,
            fc.content_text,
            jsonb_build_object(
                'type', fc.rt_code,
                'number', fc.w_number,
                'year', fc.w_year::text,
                'pasal', fc.node_number
            ),
            (0.1 + fc.sim * 0.9)::float, -- Low score base to distinguish from FTS
            LEFT(fc.content_text, 200)
        FROM fuzzy_candidates fc
        ORDER BY fc.sim DESC;
        
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_total := v_total + v_count;
    END IF;

    -- ILIKE Fallback
    IF v_total = 0 THEN
        RETURN QUERY SELECT c.id::bigint, c.work_id, c.content_text, jsonb_build_object('type', c.rt_code, 'number', c.w_number, 'year', c.w_year::text, 'pasal', c.node_number), 0.01::float, LEFT(c.content_text, 200) FROM (SELECT dn.id, dn.work_id, dn.content_text, dn.number AS node_number, w.year AS w_year, w.number AS w_number, rt.code AS rt_code FROM document_nodes dn JOIN works w ON w.id = dn.work_id JOIN regulation_types rt ON rt.id = w.regulation_type_id WHERE (SELECT bool_and(dn.content_text ILIKE '%' || word || '%') FROM unnest(string_to_array(v_safe, ' ')) AS word WHERE length(word) > 2) AND dn.node_type = ANY(v_node_types) AND dn.content_text IS NOT NULL AND (v_type_filters IS NULL OR rt.code = ANY(v_type_filters)) AND (v_year_filter IS NULL OR w.year = v_year_filter) AND (v_year_from IS NULL OR w.year >= v_year_from) AND (v_status_filters IS NULL OR w.status = ANY(v_status_filters)) LIMIT 200) c LIMIT match_count;
    END IF;
END;
$$;

ALTER FUNCTION search_legal_chunks(text, int, jsonb) SET search_path = 'public', 'extensions';
