# Handover

## 2026-09-30 (evening) — parkir-tarif diagnosis, search fix attempted + reverted

The morning session's work (below) is committed and pushed as `59cb035`, so that open item is done. **Launch is 2026-10-01**, and the decision was no more search/DB changes before launch.

### Gold status: 16/17
- The only red case is `parkir-tarif`, a **documented finding**; the diagnosis is in the comment on the case in `apps/web/gold/cases.ts`.
- 1/2024 Pasal 82 can't be retrieved by either path:
  - **Vector:** outside the top 60. The node covers five service types (kesehatan, kebersihan, parkir, …), so its embedding is diluted.
  - **FTS, AND match:** Pasal 82 never contains "retribusi", so it doesn't match.
  - **FTS, OR candidates:** `search_legal_chunks` keeps `LIMIT 100` with **no ORDER BY**. About 425 OR candidates match and an arbitrary 100 survive, which don't include Pasal 82.
  - **FTS, scoring:** OR-only rows are scored against the AND tsquery, so their fts_score is always 0.

### Search fix attempt: reverted
- **071** ranked the candidates before the LIMIT and scored OR-only rows against an OR tsquery.
- It fixed `parkir-tarif` but regressed `walet-tarif` (Pasal 56), `narkotika-hotel` (Pasal 25) and `parkir-tarif-lampiran` (I.54).
- **Production has been reverted.** The live function is 068's body again, confirmed by the maintainer in the SQL Editor.
- Migration history:
  - `071_search_rank_before_limit` is recorded as applied in Supabase.
  - The revert was run as plain SQL, so **072 is not recorded as applied**. It's idempotent and identical to 068, so applying it later is harmless.
  - Both files are in `packages/supabase/migrations/`.
- **Post-launch:** these FTS bugs are real and still open. Investigate why the three cases dropped before trying again. Always test a candidate as a `pg_temp` function against the full gold set before applying it.

### Misc
- `scripts/ocr_test_gemini.py` was added to `.gitignore` (local test script).
- There's a stray folder named `F:vector-pasaldocs` at the repo root, probably a path that lost its slashes. Check it and delete it.

## 2026-09-30 — Perbup ingest, gold expansion, embedding backfill

Branch: `feat/analytics-query-logging` (nothing from this session is committed yet).

### Done
- **PERBUP_KAB support**: migration `070_perbup_kab_type.sql`, `scripts/loader/docx_to_md.py` (DOCX → Markdown), `load_perda_bolmong.py` accepts `.docx` and classifies PERBUP/BUPATI filenames as `PERBUP_KAB`. 8 Perbup + 3 new Perda ingested (16 works total).
- **Duplicate cleanup**: the DOCX named "PERBUP NO 7 TAHUN 2025 – Penilaian PBB-P2" actually contains Perbup 8/2025 (Opsen MBLB). Its transcription was deleted and work id 21 was removed from Supabase. The real Perbup 7/2025 (PBB-P2) is **still missing** from the corpus.
- **Gold cases**: 12 new cases in `apps/web/gold/cases.ts` (2 Perda, 10 Perbup), 17 total.
- **Docs**: `docs/product-overview.md`, `corpus-coverage.md`, `how-it-works.md`, `user-guide.md`, `domain-reference.md`.
- **Embedding gap fixed**:
  - Finding: Perda 1/2024 had only 15/125 Pasal and 7/93 Lampiran nodes embedded (every other work was at 100%), so vector search could never return most of the tax Perda.
  - Cause: `get_embeddings_batch` returned `None` for the whole batch of 100 on any error, and only printed a log line.
  - Fix in `scripts/load_perda_bolmong.py`: on a batch failure, retry each text individually. Added a `--backfill-embeddings` flag that embeds any node with a NULL embedding.
  - Ran the backfill: 196/196 embedded. Perda 1/2024 is now 125/125 Pasal and 93/93 Lampiran. Un-embedded `penjelasan_pasal` rows are "Cukup jelas." stubs (<20 chars), skipped on purpose.
- **`parkir-tarif` gold query changed** to `Bagaimana retribusi parkir di tepi jalan umum dihitung?`.
  - The old query was ambiguous between Pasal 82 (tepi jalan umum, Jasa Umum) and Pasal 87 (luar badan jalan, Jasa Usaha).
  - After the backfill, the system answered correctly from live Pasal 87 plus Lampiran II.13, with dead Perda 4/2020 correctly demoted.
  - `expected` is still Pasal 82.

### Test status
- Last full gold run (before the query change): 16/17 pass. The only failure was `parkir-tarif` (answered with Pasal 87 instead of 82).
- **TODO tonight**: re-run `npm run test:gold` (from `apps/web`, with `npm run dev` running) and confirm `parkir-tarif` now returns Pasal 82.

### Open items
- [x] Re-run the gold suite. Now 16/17; see the evening section above.
- [ ] Confirm `expected.*` for the 12 new gold cases by reading each regulation. They're still `TODO(viddie)`; right now only the safety checks run for them.
- [ ] **Validity step 2** (Definition of Done) for the new Perda 1/2021, 5/2024, 7/2025 and all 8 Perbup: read each Ketentuan Penutup and add edges through `load_to_supabase.py --seed-validity`. Known: Perbup 22/2022 repeals Perbup 30/2018; Perbup 22/2025 amends Perbup 3/2022 (not in corpus → `regulation_register`).
- [ ] Get the correct Perbup 7/2025 (PBB-P2) source file and ingest it.
- [ ] Open the PR (committed and pushed as `59cb035`) (`gh` CLI is not installed; use the GitHub compare page).
- [ ] Possible follow-up: `ayat` nodes are never embedded in any work (by design so far), and ayat sources show their own number as `pasal` (e.g. "Pasal 1" for ayat 1). Worth a look if citations seem off.
