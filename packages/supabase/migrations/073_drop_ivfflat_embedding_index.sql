-- Migration 073: Drop the IVFFlat index on document_nodes.embedding (exact vector search)
--
-- The index was IVFFlat with lists = 100 over ~750 embedded nodes. At the default
-- ivfflat.probes = 1 each query scans one of 100 clusters (~1% of the corpus), so
-- match_legal_chunks returned only a handful of rows (2-14 for match_count 100) and missed
-- the right node for every confirmed gold case. With the same stored vectors, an exact
-- cosine ranking puts the expected node at rank 1-7 for all five (measured 2026-10-02):
--
--   walet-tarif           1/2024 Pasal 56   IVFFlat: not returned   exact: 2
--   sptpd-sanksi          1/2024 Pasal 116  IVFFlat: not returned   exact: 7
--   parkir-tarif          1/2024 Pasal 82   IVFFlat: not returned   exact: 5
--   narkotika-hotel       6/2025 Pasal 25   IVFFlat: not returned   exact: 1
--   parkir-tarif-lampiran 1/2024 Lamp. I.54 IVFFlat: not returned   exact: 1
--
-- At this corpus size (thousands of rows at most) a sequential scan is exact and takes a few
-- milliseconds, so no ANN index is used. HNSW was not chosen: it is still approximate and
-- applies the filter_work_id predicate after candidate selection, which can starve the
-- scoped successor lookup in the chat route. Revisit only if the corpus grows by orders of
-- magnitude — and then measure recall against the gold set before shipping.
--
-- The live index name (document_nodes_embedding_idx) was created outside the migration
-- history; 056 creates idx_nodes_embedding. Drop both.

DROP INDEX IF EXISTS public.document_nodes_embedding_idx;
DROP INDEX IF EXISTS public.idx_nodes_embedding;
