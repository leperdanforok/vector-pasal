-- Migration 066: Allow `lampiran_tarif` as a document_nodes.node_type
--
-- The Lampiran chunking fix (scripts/loader/load_to_supabase.py:_split_lampiran_sections)
-- emits per-table `lampiran_tarif` content nodes under a `lampiran` container. The container
-- type `lampiran` was already in the document_nodes_node_type_check CHECK constraint, but
-- `lampiran_tarif` was NOT — so every tariff node insert failed with a 23514 check violation
-- during the 1/2024 re-ingest, leaving the appendix unsearchable.
--
-- This extends the allowed node_type set with `lampiran_tarif`. Existing rows are unaffected
-- (we only widen the set), so the re-validation on ADD CONSTRAINT is trivially satisfied.
--
-- APPLY ORDER: apply BEFORE (re-)ingesting any Perda with a tariff appendix. Migration 065
-- (search filter) and 067/068 (node_type in RPC metadata) are independent of this one.

ALTER TABLE document_nodes DROP CONSTRAINT IF EXISTS document_nodes_node_type_check;

ALTER TABLE document_nodes ADD CONSTRAINT document_nodes_node_type_check
  CHECK ((node_type)::text = ANY ((ARRAY[
    'root',
    'preamble',
    'bab',
    'bagian',
    'paragraf',
    'pasal',
    'ayat',
    'poin',
    'lampiran',
    'lampiran_tarif',
    'penjelasan_umum',
    'penjelasan_pasal'
  ])::text[]));
