# Handover

## 2026-10-02 — vector index dropped, gold 17/17

### Finding: vector search was barely working
- The embedding index on `document_nodes` was IVFFlat with `lists=100` over 754 vectors. At the default `probes=1` each query searched one cluster (~1% of the corpus), so `match_legal_chunks` returned 2–14 rows even for `match_count` 100.
- None of the 5 confirmed gold nodes came back through the RPC. With the same stored vectors, an exact cosine search ranked them 1–7 (walet 2, sptpd 7, parkir-tarif 5, narkotika 1, lampiran I.54 1).
- So the evening diagnosis below ("Pasal 82 embedding is diluted, outside the top 60") was wrong. The embedding was fine; the index dropped it. Every gold pass before today came mostly from FTS.

### Fix: migration `073_drop_ivfflat_embedding_index.sql`
- Drops the index, so vector search is an exact scan (~9 ms for 754 rows). Rationale and the HNSW trade-off are in the file header.
- Applied by the maintainer in the SQL Editor (so, like 072, **not recorded as applied** in Supabase migration history; it's idempotent).
- **Live in production now**: prod and dev share this DB.
- Rollback: `CREATE INDEX document_nodes_embedding_idx ON public.document_nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`

### Result
- Gold before: 16/17 (`parkir-tarif` red). Gold after: **17/17**. `parkir-tarif` now cites 1/2024 Pasal 82.
- The FTS bugs in `search_legal_chunks` (unordered `LIMIT 100`, OR-only rows scored 0) are still real, but no longer block any gold case. Lower priority now.

### Next
- Post-launch order item 2 is now "FTS ranking bug, lower priority". Validity step 2 is still first.
- Planned and approved, not yet done: one shared embedding path in `load_perda_bolmong.py` + a fail-loud embedding coverage check (#3), then section-path prefixes in embedding text (#2), measured offline with exact ranks before any re-embed.
- Dev gotcha hit today: Turbopack's dev cache dropped `/api/chat` (404 on GET and POST). Fix: stop dev, delete `apps/web/.next`, restart. The gold runner needs GET `/api/chat` → 405.

## 2026-09-30 (evening) — parkir-tarif diagnosis, search fix attempted + reverted

The morning session's work (below) is committed and pushed as `59cb035`, so that open item is done. **Launch is 2026-10-01.** The decision was no more search/DB changes before launch, and the branch was deployed to production at `40c7933` (see "Deployed to production").

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

### Deployed to production
- `feat/analytics-query-logging` @ `40c7933` is live on Vercel (`dpl_5DLByjKS9v4GRitFw35H2Cw79Wi3`, state READY, target production).
- **Rollback:** the previous production deploy, `fb3128b` (`dpl_2XX6yRV2tVpXQi8ydUVzXbaXtAaH`), is the rollback candidate. Use Vercel → Deployments → ⋯ → Promote to Production.
- What changed in the web app since `fb3128b`: only the maintenance-mode page and middleware toggle. `MAINTENANCE_MODE = false` in `apps/web/src/middleware.ts`; flip it, push, and redeploy to turn maintenance on.
- **How deploys work here:**
  - The Vercel project is linked to the GitHub repo but does **not** auto-deploy on push and posts no PR checks.
  - Deploys are manual: Vercel → Deployments → Create Deployment → branch or commit.
  - Production runs this branch. `main` is behind; merging the open PR into `main` just catches it up and doesn't deploy.
- **Pre-deploy checks:**
  - Unit tests: 66/66 pass.
  - Gold suite: 16/17, with `parkir-tarif` a known red.
  - Lint: 30 errors and 14 warnings, all `no-explicit-any` or `<img>` style issues with no runtime effect. Next 16 `next build` doesn't run lint. Clean up after launch.
- **Launch caveat:** validity step 2 hasn't been done for the 11 new works. The two known relations point at regulations that aren't in the corpus (Perbup 30/2018, 3/2022), so they can't cause dead-law answers. Still unchecked: whether anything newer, outside the corpus, repeals or amends one of the 11. Check that first after launch.

### Post-launch order
1. Validity step 2, starting with the reverse check above.
2. The `search_legal_chunks` ranking bug.
3. Lint cleanup (`any` types, mostly in `api/chat/route.ts`).
4. Fill `work`/`pasal` for the 12 new gold cases. `validity_state: 'live'` is already set, but the ground-truth check stays skipped until `work` and `pasal` are filled.
5. Get the real Perbup 7/2025 (PBB-P2) file and ingest it.

### Misc
- `scripts/ocr_test_gemini.py` was added to `.gitignore` (local test script).

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
- [x] PR opened. Production deploys don't depend on it; see "Deployed to production" above. (`gh` CLI is not installed; use the GitHub compare page).
- [ ] Possible follow-up: `ayat` nodes are never embedded in any work (by design so far), and ayat sources show their own number as `pasal` (e.g. "Pasal 1" for ayat 1). Worth a look if citations seem off.
