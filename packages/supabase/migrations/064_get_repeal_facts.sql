-- Migration 064: get_repeal_facts(work_ids) — raw repeal facts for the validity layer
--
-- Returns one row per `dicabut_oleh` edge for the requested works. The STATE MAPPING
-- (live / repealed_with_successor / repealed_no_successor) is intentionally NOT done here —
-- it lives in code (apps/web/src/lib/validity.ts). This function only surfaces deterministic
-- facts: which works are repealed, by what successor (work or register), and whether that
-- successor has text in the corpus (successor_node_count > 0).

CREATE OR REPLACE FUNCTION get_repeal_facts(work_ids integer[])
RETURNS TABLE (
    work_id integer,
    successor_work_id integer,
    successor_register_id integer,
    successor_number text,
    successor_year integer,
    successor_node_count bigint
)
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
  SELECT
    wr.source_work_id AS work_id,
    wr.target_work_id AS successor_work_id,
    wr.target_register_id AS successor_register_id,
    COALESCE(tw.number, rr.number) AS successor_number,
    COALESCE(tw.year, rr.year) AS successor_year,
    COALESCE((SELECT count(*) FROM document_nodes dn WHERE dn.work_id = wr.target_work_id), 0) AS successor_node_count
  FROM work_relationships wr
  JOIN relationship_types rt ON rt.id = wr.relationship_type_id
  LEFT JOIN works tw ON tw.id = wr.target_work_id
  LEFT JOIN regulation_register rr ON rr.id = wr.target_register_id
  WHERE rt.code = 'dicabut_oleh'
    AND wr.source_work_id = ANY(work_ids);
$$;
