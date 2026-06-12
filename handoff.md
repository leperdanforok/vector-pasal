# Vector Pasal — Session Handoff

*Last session: 2026-06-13 (validity-state UI treatments — consume the source.validity contract; 5 treatments, dev preview, dead-content hidden behind acknowledgment). Prior: 2026-06-12 (Lampiran Day-2 — re-ingest live + citation labels + validity-keyed gold guard; **"berapa tarif parkir" now answers live with real numbers**); 2026-06-11 (Lampiran chunking fix — chunker rebuild, parsing-level only); 2026-06-09 (parkir gap investigation + corpus Lampiran retrieval bug); 2026-06-08 (gold-set harness + ingest DoD + dev-route fix); 2026-06-04 (legal-validity layer + chat behavior fixes); 2026-05-25 (ingestion+cleanup AM, redesign PM).*

## Project goals

AI legal-assistant RAG for **Satpol PP Kabupaten Bolaang Mongondow**. Indonesian Regional Regulations (Perda) for Bolmong are ingested into Postgres + pgvector, queried through a hybrid (vector + FTS + trigram) search, and grounded with Gemini for citation-faithful Indonesian-language answers.

This repo is a Bolmong-narrowed **fork of [pasal.id](https://pasal.id)**. ~40% of the codebase is leftover scaffolding from the original general-purpose Indonesian legal database. Active vs. leftover map lives in [CLAUDE.md](CLAUDE.md).

## Current state

### What happened this session (2026-06-13) — validity-state UI treatments (frontend consumption only)

Built the UI layer that makes legal validity **visible** and dead law **un-mistakable for live law**, purely consuming the `source.validity` + `role` + `node_type` contract Day-2 put on the wire. **No changes to validity.ts, the route, retrieval, or the gold harness.** All **uncommitted** on `feat/legal-validity-layer` (working tree).

**Contract reconciliation done first (code wins):** the frontend `Source` type was dropping `validity`/`role`/`node_type` entirely — they arrived over NDJSON and were discarded. A per-source `validity.state` is only ever `live` / `repealed_with_successor` / `repealed_no_successor`; `out_of_coverage` and `successor_unretrieved` have **no source** (response-level, no card). `repealed_with_successor` only ever appears as `role:'demoted'` (never hero). Captured in [validity-ui.ts](apps/web/src/lib/validity-ui.ts) header comment.

**New files:**
- [apps/web/src/lib/validity-ui.ts](apps/web/src/lib/validity-ui.ts) — pure presentational mapping `validityPresentation(state) → {label, icon, tone}` + extended `Source` type + node_type-aware `pasalLabel`/`perdaRef` (mirrors the route's Lampiran-vs-Pasal rule).
- [apps/web/src/components/Icon.tsx](apps/web/src/components/Icon.tsx) — Icon set **extracted** from page.tsx so the chat and the dev preview share the same components (added alert-triangle/eye/eye-off/lock/building).
- `apps/web/src/components/validity/` — `ValidityBits` (ValidityBadge, **DeadContentDisclosure**, AcknowledgeGate), `SourceCard` (VPSourceCard, all states), `ValidityNotice`, `DocumentModal`.
- [apps/web/src/app/[locale]/dev/validity-states/page.tsx](apps/web/src/app/[locale]/dev/validity-states/page.tsx) — preview of all 5 states; **LIVE-VERIFIED** fixture = the captured parkir frame (content read read-only from `document_nodes` ids 2287/2311/990/1013/961, no re-POST), **MOCK-TESTED** for the rest. Light/dark toggle. Reachable at **`/dev/validity-states`** (under `[locale]`, no middleware change).

**Changed:** [page.tsx](apps/web/src/app/[locale]/page.tsx) now imports the extracted Icon/VPSourceCard/DocumentModal/Source (inline versions removed); [globals.css](apps/web/src/app/globals.css) gains **one** `--vp-warning` token (light+dark) + `.vp-source-card--demoted/--gated`, `.vp-validity-badge`, `.vp-dead-*`, `.vp-ack-*`, `.vp-validity-notice` classes.

**The five treatments (screenshots confirmed, light + dark):**
- **live** → green "Berlaku" badge; ref label honours node_type ("Lampiran I.54").
- **repealed_with_successor (demoted)** → dimmed subordinate footnote, "DICABUT" + "Diganti oleh Perda No 1/2024", **dead body collapsed**, revealed only on a deliberate "Lihat teks lama" click **with a persistent DICABUT watermark**. Makes the off-topic walet-under-parkir demoted refs read as "related repealed regulation," not answer content.
- **repealed_no_successor** → amber `--vp-warning`, "Saya paham" gate (the only gated state). MOCK.
- **out_of_coverage** / **successor_unretrieved** → card-less `ValidityNotice` pointing to Bagian Hukum. MOCK (`successor_unretrieved` folded in at user request).

**Safety verified end-to-end:** dead content = 0 in default render (collapsed); live tariffs shown; the **document modal suppresses the `Salin` (copy) button for dead sources** (footer = `["Tutup"]` only) while keeping it for live — officers can't copy dead numbers. Why this matters: live 1/2024 Lampiran I.54 parking rates are the *same numbers* as dead 4/2020 (Rp2.000/4.000/8.000), so the dead/live boundary is the only safe signal — see [[parkir-tariff-validity-not-digits]].

**Verification:** `npx tsc --noEmit` clean; `npm run test` 52/52; `/dev/validity-states` HTTP 200, no error overlay; light + dark both correct; only console error is a pre-existing CSP block of Vercel analytics (unrelated).

**TODO next:**
1. **Commit + push** the working tree (validity-ui, Icon, components/validity/*, page.tsx, globals.css, dev preview, handoff) — currently uncommitted. Then it can ship with the Day-2 commit `af4c39a` (also unpushed-as-PR).
2. The two notice states are **wired in the dev preview only** — the live route streams `successor_unretrieved`/`out_of_coverage` as text with no machine-readable frame, so wiring them into live chat needs a route signal (a `{type:'state'}` NDJSON frame) — a deliberate route change, out of this session's scope.
3. **Pre-existing wart, not fixed (by design):** the demotion filter keys on successor work, not topic, so walet 2/2021 refs still surface under a parkir answer. The demote treatment now makes that read acceptably ("related repealed regulation"), but topic-scoping the filter is the real fix when someone touches the route.
4. No PR open yet for `feat/legal-validity-layer`.

### What happened this session (2026-06-12) — Lampiran Day-2: re-ingest LIVE + citation labels + validity-keyed gold guard

Executed Day-2 of the 2026-06-11 plan against the live `Pasal-Bolmong` DB (`vjtdzmixoecmfshfydwr`). **The Lampiran-blob bug is now fixed end-to-end: "Berapa tarif parkir?" returns live 1/2024 Lampiran I.54 with real numbers.** All work is **uncommitted** on `feat/legal-validity-layer` (working tree) — not yet committed/pushed.

**Migrations applied (065–068):**
- **`065`** — adds `lampiran_tarif` to `search_legal_chunks`'s node-type filter (was authored, now applied).
- **`066` (NEW, unplanned — surfaced during re-ingest)** — `document_nodes_node_type_check` allowed `lampiran` (container) but **not `lampiran_tarif`**, so the first re-ingest had all 93 tariff inserts rejected (23514). 066 widens the CHECK to include `lampiran_tarif`. **Lesson:** a new node_type needs BOTH the search-filter (065) AND the table CHECK constraint — the parsing-level `inspect_lampiran_split.py` can't catch a DB-constraint failure.
- **`067`** — `node_type` added to `match_legal_chunks` (vector) metadata (trivial CREATE OR REPLACE).
- **`068`** — `node_type` threaded through `search_legal_chunks` CTEs (`and_m`/`or_m`/`sanctions` → `nt`) into the final metadata jsonb. Supersedes 065's function body. (Plan called these 066/067; renumbered to 067/068 because the constraint fix took 066.)

**Re-ingest (live):** added a crash-safe `--only <substr>` in-memory filter to [load_perda_bolmong.py](scripts/load_perda_bolmong.py) (no PDF move/restore). `python scripts/load_perda_bolmong.py --only 2024` re-used **work_id 3** (frbr_uri match), `cleanup_work_data` wiped node 498, re-parsed with the splitter → **344 nodes (251 body + 93 lampiran_tarif), 225 embedded, 125 pasals, 3 containers**. **Node 498 is gone**; no node corpus-wide >12k; all 93 tariff nodes ≤8k (max 7,964), all embedded.

**Retrieval verified (SQL, post-068 re-check too):** each tariff query surfaces its distinct `lampiran_tarif` node — **parkir → I.54 rank #1**, kesehatan → I.14 #1, lab → II.12.x #1 (pasar I.55 / gigi I.28 land rank 3–4 under pure FTS since "tarif" is ubiquitous; vector + LLM filter handle final relevance). `metadata.node_type` now present on both RPCs.

**Citation labels** ([route.ts](apps/web/src/app/api/chat/route.ts)): context header renders `[Perda No 1/2024, Lampiran I.54]` (vs `Pasal`) when `meta.node_type === 'lampiran_tarif'`; cited-source detection now also captures `Lampiran <roman.dotted>` citations so tariff answers get source cards.

**Validity-keyed gold guard** (the `must_not_contain` rework): sources now carry `role: 'hero' | 'demoted'` (route.ts `toSource`); [gold.test.ts](apps/web/gold/gold.test.ts) adds a corpus-agnostic assertion — **no hero source may be a repealed work** (demoted refs exempt). [cases.ts](apps/web/gold/cases.ts) `parkir-tarif`: **dropped the unsafe p2 dotted-number regex** (live 1/2024 tariffs use the same dotted forms), kept the safe p1 bare-`2000/parkir` (unique to dead 4/2020). Added scaffold case **`parkir-tarif-lampiran`** ("Berapa tarif parkir?") with `expected.* = TODO(viddie)` — fill from the live read below.

**KEY FINDING — why digit-guards were always doomed:** live 1/2024 Lampiran I.54 parking rates are **Rp2.000 / Rp4.000 / Rp8.000** — *identical numbers* to the dead 4/2020 flat tariffs. Only the cited source's `validity.state` can distinguish a correct live answer from a dead one. The live answer is dotted ("Rp2.000") so p1 (bare "2000/parkir") correctly does not fire.

**Live answer captured (`POST /api/chat` "Berapa tarif parkir?"):** cites **1/2024 Lampiran I.54** (Roda 2/3 Rp2.000, Roda 4 Rp4.000, Roda 6+ Rp8.000 /parkir) + **Lampiran II.13** (rekreasi), both `role:hero validity:live`. No 4/2020 leak.

**Verification:** `tsc` clean; `npm run test` 52/52; gold — walet/sptpd/narkotika ✓, **parkir-tarif ✗ (PRE-EXISTING open finding, Pasal 82 — untouched this session, needs the user's legal call)**, parkir-tarif-lampiran ✓ (safety+hero-guard; ground-truth TODO skipped).

**TODO next:**
1. **Author `parkir-tarif-lampiran` expected.*** by reading 1/2024 Lampiran I.54 (work=1/2024, pasal="I.54", validity_state="live"). Never auto-fill.
2. **Resolve the pre-existing `parkir-tarif` (Pasal 82) finding** — is 82 the right expectation, or should the query/expectation change? (See 2026-06-08 note.)
3. **Cosmetic (pre-existing, not a regression):** under the parkir answer, three **walet 2/2021** pasals appear as `demoted` refs — because both walet 2/2021 and parkir 4/2020 were repealed by the *same* successor (1/2024), and the demotion filter keys only on `successorWorkId ∈ heroWorkIds`, not topic. Harmless (correctly labeled repealed, never fed to the LLM) but confusing UX; consider topic-scoping the demotion when the validity UI work resumes.
4. Commit the working tree (migrations 065–068, loader `--only`, route.ts, gold/*) — currently uncommitted.

### What happened this session (2026-06-11) — Lampiran chunking fix (chunker rebuild, NO live DB writes)

Fixed the corpus-wide Lampiran-blob bug **at the ingestion/chunking level**. All parsing-level work, **no re-ingest, no Supabase writes** — the live DB (node 498) is untouched until Day 2. Three commits on **`feat/legal-validity-layer`**:

- **`478927b`** — **`_split_lampiran_sections()`** in [scripts/loader/load_to_supabase.py](scripts/loader/load_to_supabase.py). Peels the tariff appendix off the **raw markdown** (before `_normalize_markdown_for_parser` strips `#`/`**`) and turns every markdown heading into its own **`lampiran_tarif`** node under a `lampiran` container, retaining the heading inside `content_text` so topic words reach FTS + the embedding. Wired into `process_pdf`'s transcription branch (no-op on the PyMuPDF path / any transcription without a `### LAMPIRAN` heading). Registered `lampiran_tarif` in both content-type tuples. **Root cause** (now in the commit msg): the penjelasan "II. PASAL DEMI PASAL" splitter (parse_structure.py:576) runs to EOF, so the **last** penjelasan pasal (Pasal 123) swallowed all of Lampiran I/II/III → node 498, `penjelasan_pasal`, 182k chars.
- **`4a0f4ab`** — **`_subsplit_table_section()`**: a section whose body is one long table with no markdown sub-headings (II.12 PENGUJIAN LABORATORIUM) gets sub-split at **bold in-table label rows** (rows with `**` and no currency value), greedy-packing whole label-groups into ≤cap chunks and **re-attaching each table block's column header** so no row is orphaned. Refuses to cut (`None` → node kept, inspection FAILs for manual decision) when there's no structural boundary or a single group already exceeds the cap — never a blind mid-table slice. Runs on raw markdown (where `**` survives).
- **`311fde8`** — tightened the node cap **12k → 8k chars** (`_LAMPIRAN_NODE_CAP` + inspection `MAX_TARIF_CHARS`) as a proxy for gemini-embedding-001's ~2048-token window.

**Verified (parsing-level, [scripts/loader/inspect_lampiran_split.py](scripts/loader/inspect_lampiran_split.py)):** 1/2024 → 3 containers, **93 tariff nodes, every node ≤ 8,000**, parkir/pasar/kebersihan/kesehatan each distinct, body still parses **125 pasals**, no appendix leak (body tail ends at Pasal 123); clean no-op on the other 4 transcriptions. **No node hit refuse-to-cut** — everything reduced at semantic boundaries. Sections sub-split at 8k: I.38→2, II.1→6, II.12→5, III.1→5.

**Migration 065** ([packages/supabase/migrations/065_lampiran_tarif_searchable.sql](packages/supabase/migrations/065_lampiran_tarif_searchable.sql)) authored, **NOT applied** — adds `lampiran_tarif` to `search_legal_chunks`'s node-type filter. `match_legal_chunks` (vector) needs no change (filters only on `embedding IS NOT NULL`).

#### Day 2 — re-ingest + live verify (the chunker change does nothing until this runs)
1. **Apply migration 065** (Supabase SQL editor or MCP). Harmless no-op on current data (no node has the type yet).
2. **Re-ingest 1/2024 only:** `python scripts/load_perda_bolmong.py` (the loader's `cleanup_work_data` wipes 1/2024's nodes incl. **498**, re-parses with the new splitter, re-embeds). Watch for `[Lampiran] Split appendix into 3 container(s), 93 tariff section node(s)`. Use plain `python` (no repo venv).
3. **Live-verify** "berapa tarif parkir / pasar / kesehatan / gigi / pengujian laboratorium" now surface the right `lampiran_tarif` node instead of "tidak ditemukan".
4. **Citation-label fix (route, easy to miss):** a `lampiran_tarif` node's `number` is like `"I.54"` / `"II.12.1"`, so the chat route's `[Perda No N/YYYY, Pasal X]` header renders "Pasal I.54". Add node_type-aware labeling ("Lampiran" vs "Pasal") in [route.ts](apps/web/src/app/api/chat/route.ts) with the re-ingest.
5. **Then** the paused gold/UI work + validity-keyed `must_not_contain` rework can resume (parkir tariffs are now retrievable; the guard must key on `validity.state`, not digit strings — see 2026-06-09 note below).

**Rollback:** today is code + an unapplied migration → `git revert` restores it; node 498 untouched; cached transcriptions reproduce the old structure. Nothing irreversible until step 2 runs (itself re-runnable from cache).

**Loose ends (cosmetic, flagged not fixed):** II.1.x sub-nodes all share the parent title "STRUKTUR…JASA USAHA" (their sub-tables carry no bold label → breadcrumb falls back to parent); II.12.2's title uses a mid-list bold label. Two single-section nodes sit just under the 8k cap (II.11=7,793, I.46=7,964) — kept whole; they'd be the next candidates if the cap dropped, and *could* be irreducible single tables worth surfacing.

### What happened this session (2026-06-09) — parkir investigation + corpus Lampiran bug

- **parkir-tarif gold gap diagnosed.** Pasal 82 ("Tingkat penggunaan jasa atas pelayanan Jasa Umum" — the basis for *how* parking retribusi is calculated; parkir is a Jasa Umum object per Pasal 76) is the **correct** live answer, but it's **keyword-invisible** (its text has no "parkir"/"tarif"), so neither FTS nor (confirmed end-to-end) vector surfaces it — the pipeline cites 76/75/79 instead. The `knownGap` representation (keep `expected: Pasal 82`, render as a visible **skip** that auto-flips red if 82 ever surfaces) was designed + approved but **NOT YET implemented** (paused to investigate). [cases.ts](apps/web/gold/cases.ts) still has `parkir-tarif` as a hard red.
- **Transient Gemini 503 ("high demand")** dogged all live testing: refinement/embedding calls 503 → the route's outer catch returns `{"error":"Terjadi kesalahan pada server."}` (500). Not a code bug — retry. (The gold runner already skips transient upstream failures.)
- **MAJOR bug found (below).**

### RETRIEVAL BUG (corpus-wide, found 2026-06-09): Lampiran ingested as one blob, mistyped

> **STATUS 2026-06-11: chunker FIXED (commits `478927b`/`4a0f4ab`/`311fde8`), live DB NOT yet re-ingested.** The splitter below now produces 93 per-table `lampiran_tarif` nodes (≤8k each) instead of node 498's 182k blob — verified at the parsing level. Node 498 still exists in the DB until the Day-2 re-ingest (see the 2026-06-11 section above). **Until that re-ingest runs, live tariff answers are still unreliable.**

Lampiran sections ingest as a single giant node, mistyped. **Confirmed:** Perda 1/2024 **node id 498**, `node_type = penjelasan_pasal` (attached to Pasal 123's penjelasan), **182,170 chars** — the ENTIRE Lampiran (Lampiran I/II/III fused; ~13,932 table cells: parking, pasar, health tariffs) in one node = one embedding → **unrankable** for any specific tariff query. This is why "berapa tarif parkir / pasar / etc." returns "tidak ditemukan" even though the data IS ingested. Root cause is in the **ingestion/chunking pipeline** (LAMPIRAN not split per-table; mistyped as `penjelasan_pasal`) → affects **every Perda with a substantial appendix**, not just 1/2024. (Verified 2026-06-09: node 498 is the only node corpus-wide over 12k chars, so 1/2024 is the only currently-ingested work that manifests it — but the flaw is general.)

**Until fixed, all Lampiran-based tariff answers are unreliable.**

**FIX (next session, fresh):**
1. Split Lampiran into **per-table nodes** with a correct `node_type` (a `lampiran` / `aturan` content type, not `penjelasan_pasal`); fix in the ingestion/chunking pipeline.
2. Re-ingest + **re-embed** affected Perda (1/2024 first), then re-verify "tarif parkir / pasar / kesehatan" queries surface the right table.
3. **Revisit `must_not_contain` (now known unsafe):** live 1/2024 Lampiran tariffs share the same number patterns as dead 4/2020, so a digit-string guard can block a *legitimate* live answer. Verified nuance: the exact `2000/parkir` form is NOT in node 498 (regex p1 safe), but dotted forms (`[248].000`, p2) WOULD match live Lampiran health/other tariffs. **The guard must key on the cited source's `validity.state` (is it a repealed work?), not on the number string.** Update the parkir gold case accordingly when the gold/validity work resumes.

### Still-paused work (for next session)
- `parkir-tarif` → `knownGap` + visible-skip change ([cases.ts](apps/web/gold/cases.ts) + [gold.test.ts](apps/web/gold/gold.test.ts)): designed, approved, **not implemented**.
- Validity-state **UI treatments** (consume `source.validity`): designed (ValidityBadge / SourceCard / GatedAnswer / InfoNotice + one `--vp-warning` token + `/dev/validity-states` preview), **not started**.
Both now intersect the Lampiran fix + the validity-keyed `must_not_contain` correction above.

### What landed this session (2026-06-08) — gold-set regression harness + ingest DoD + dev-route fix

All on branch **`feat/legal-validity-layer`** (pushed; PR still not opened). Latest commit `8599366`.

**1. Gold-set regression harness** (`cd9d353`) — `apps/web/gold/`: runs the **real** `/api/chat` pipeline against known-correct answers so validity can't silently regress. Opt-in via **`npm run test:gold`** (needs a running app at `GOLD_BASE_URL`, default `:3000`; real Gemini calls). Kept out of the default 52-test suite (`vitest.config.ts` excludes `gold/**`; separate `vitest.gold.config.ts`).
- [gold/cases.ts](apps/web/gold/cases.ts) — `GoldCase` schema + `TODO(viddie)` sentinel for legal ground truth the maintainer authors. `must_not_contain` supports `re:` regex. **Never auto-fill `expected.*`.**
- [gold/runner.ts](apps/web/gold/runner.ts) — HTTP POST + NDJSON parse. **Hardened (`8599366`)**: detects transient upstream failures (5xx / empty answer / the route's streamed error notices), retries with backoff (`runCaseWithRetry`), and the test **skips** (not fails) if it persists — a red gold case means a real regression, never "Gemini 503".
- [gold/gold.test.ts](apps/web/gold/gold.test.ts) — safety (`must_not_contain`) always runs; ground-truth runs only when filled, else skipped with an `afterAll` warning.

**2. Ingest "Definition of Done"** (`28b93be`) — added to [CLAUDE.md](CLAUDE.md#ingesting-a-new-perda--definition-of-done): the 3-step gate (embed → **map validity relations (mandatory, human-only)** → gold cases for high-stakes content). Plus a validity-layer note in the data-model section. handoff "Adding Perdas?" recipe now defers to it. This is the user's own rule set — step 2 is the one most likely skipped, and skipping it reintroduces dead-law-served-as-live.

**3. handoff sync** (`cd9d353`) — corrected the four sanity-query expectations to validity-correct answers (live 1/2024, not repealed 2/2021/4/2020); fixed the "Adding Perdas?" recipe (parkir PDF *is* in `data/raw_pdf/`; Trantibum *is* ingested); dropped the stale "not re-dogfooded" line; marked 2/2021 & 4/2020 repealed in the corpus table.

**4. Dev-route 404 fix** (`d0ec225`) — disabled `experimental.turbopackFileSystemCacheForBuild` in [next.config.ts](apps/web/next.config.ts). That experimental persistent cache intermittently dropped Node-runtime API routes (`/api/chat`, `/api/v1/*`) from the dev route tree → 404s/empty responses that looked like app/test failures; clearing `.next` only fixed it sometimes. **Recurring gotcha:** if API routes 404 in dev, it's this (now fixed); the older fallback was `Remove-Item -Recurse -Force .next` + restart.

**Gold run status (verified live):** walet → 1/2024 Pasal 56 ✅ · narkotika → 6/2025 Pasal 25 ✅ · sptpd → 1/2024 Pasal 116 ✅ (cites the live ketentuan pidana; dead "6 (enam) bulan" term absent) · **parkir → RED (open finding)**.

**OPEN — parkir gold case (`parkir-tarif`), needs the user's legal read of Perda 1/2024.** Expected `Pasal 82` (on-street *tingkat penggunaan jasa*, Retribusi Jasa Umum), but the pipeline cites **75 / 87 / 84** (generic "dihitung" query) or **76** ("tepi jalan" query) — never 82. Decide: is 82 correct and a **retrieval gap**, should the gold `query` target what 82 covers, or is a broader pasal (75/76) the right expectation? Dead-tariff safety regex passed in all variants (no Rp2.000–8.000 leak). [apps/web/gold/cases.ts](apps/web/gold/cases.ts) is **left uncommitted** (user's authored truth: sptpd=116 confirmed-correct; parkir=82 pending) — commit it once parkir is resolved.

### What landed this session (2026-06-04 PM) — legal-validity layer (derivation phase)

The corpus contained **repealed** Perda served as if live: **Perda 1/2024 (HKPD) Pasal 122 repealed both Perda 2/2021 (Walet) and Perda 4/2020 (Parkir)**; Parkir 4/2020 also amends Perda 20/2010 (no text in corpus). Built a validity layer where **status is derived in code from `work_relationships`, never by the LLM**. Committed on branch **`feat/legal-validity-layer`** (`061166f`), **not yet pushed / no PR**.

**Migrations 060–064 (all applied to the live `Pasal-Bolmong` Supabase project `vjtdzmixoecmfshfydwr`):**
- `060` `regulation_register` — known-but-absent regs (table for the `out_of_coverage` state).
- `061` `work_relationships` gains nullable `target_register_id` + `chk_one_target` CHECK; partial unique index `uq_rel_register`; `works.status` commented as **NOT authoritative** for validity.
- `062` `match_legal_chunks` recreated (atomic DROP/CREATE) to return `work_id` + accept optional `filter_work_id`. **Signature is now 4-arg** (4th optional) and returns an extra `work_id` column — backward-compatible with the deployed 3-arg call.
- `063` `search_legal_chunks` accepts a `work_id` key in `metadata_filter` (sanction-aware force-fetch scope). Signature unchanged.
- `064` `get_repeal_facts(work_ids)` — returns raw repeal facts; **state mapping stays in TS**, not SQL.

**Seeded** via `./venv/Scripts/python.exe scripts/loader/load_to_supabase.py --seed-validity` — strict, **fail-loud** (raises on any URI miss, never silent SKIP) with a post-seed row-count assertion. Result: **4 work↔work edges + 1 work→register edge + 1 register row** (Perda 20/2010). Re-runnable/idempotent.

**Derivation + answer safety:**
- [apps/web/src/lib/validity.ts](apps/web/src/lib/validity.ts) — `tagValidity()` (live / repealed_with_successor / repealed_no_successor) + pure `classifyByValidity` / `decideAnswer` helpers.
- [apps/web/src/app/api/chat/route.ts](apps/web/src/app/api/chat/route.ts) — tags matches, then the **answer-safety partition**: a dead `repealed_with_successor` node is **never** fed to the LLM even when 0 live nodes were retrieved; the successor article is **force-fetched** (retrieval scoped to `successorWorkId`); if still unfound → **`successor_unretrieved`** (serves a "verify with Bagian Hukum" notice, **no dead content**). Sanction-expanded nodes obey the same rule. Demoted repealed refs shown only when the live answer is from *their* successor. Each `sources` item now carries `validity`.
- [apps/web/src/lib/prompt.ts](apps/web/src/lib/prompt.ts) — `SYSTEM_INSTRUCTION` forbids the LLM from asserting in-force/repealed/amended status.

**Verified live (dev server against migrated+seeded DB):**
- Walet query → answers from **live 1/2024 Pasal 56**; 2/2021 walet Pasals demoted `repealed_with_successor`.
- **Parkir query (the dangerous one)** → answers from live 1/2024 / honest "tidak ditemukan"; **no dead flat-tariff leak** (Rp2.000–8.000).
- Narkotika (live-only) → 6/2025 Pasal 25 live, no stray demoted ref.
- `npm run test` 52/52 (incl. `validity.test.ts` 10 tests with the `successor_unretrieved` hole case); `tsc` clean in `src/`.

**Deferred to next phase (NOT built):** the four UI treatments + the `repealed_no_successor` "Saya paham" acknowledgment gate, and the automatic `out_of_coverage` chat trigger (register search). The data contract (`source.validity`) is ready for the UI to consume. Plan: `~/.claude/plans/hi-i-just-paid-quizzical-torvalds.md`.

**Note:** the deployed Vercel app does NOT yet have this route behavior — only ships on the next deploy. Migrations are backward-compatible so production chat keeps working in the meantime.

### What landed this session (2026-06-04) — chat behavior fixes

First post-launch testing on a **paid Gemini key**. User reported three issues; all fixed on `redesign/vp-chat-shell` (commit `fix(chat): conversation memory, scoped sources, observable errors`).

1. **Assistant re-greeted on every message.** Root cause: the chat was stateless — the client POSTed only the latest message, so Gemini saw every turn as turn 1 and re-introduced itself.
   - [page.tsx](apps/web/src/app/[locale]/page.tsx) `submitQuery` now sends the last 8 turns as `history` (`{ role, content }`) in the POST body.
   - [route.ts](apps/web/src/app/api/chat/route.ts) builds a multi-turn Gemini `contents` array (history mapped to `user`/`model` roles; retrieval context injected only on the final user turn via `buildUserPrompt`).
   - [prompt.ts](apps/web/src/lib/prompt.ts) gained a "Konteks Percakapan" rule: greet/introduce **only at conversation start**, and use history for follow-ups ("kalau sanksinya?").
2. **"Sumber Dokumen" card appeared on every reply** — even for "halo". Root cause: step 8 unconditionally fell back to `matches.slice(0,3)`, and the vector search threshold is a very lenient `0.1`, so any input returned matches. Fix: sources now stream **only when the answer actually cites a Pasal** (`citedPasals.length > 0` → `filteredMatches.slice(0,3)`, else nothing). UI already hides empty sources.
3. **Intermittent "disconnect"** — user confirmed it showed an *error message* (handled error, not a true network drop) whose generic wording hid the cause. Fixes in [route.ts](apps/web/src/app/api/chat/route.ts):
   - Inspect each chunk's `finishReason`/`promptFeedback.blockReason`; on **RECITATION/empty** completion, **retry once at temp 0.4** (the project's documented mitigation) — only when no text was streamed yet, so the user never sees duplicated text.
   - Specific Indonesian messages for RECITATION / SAFETY / quota (429) instead of one generic string; full cause is `console.error`-logged both in-stream and in the outer catch.
   - Added `export const runtime = 'nodejs'` and `export const maxDuration = 60` so a deployed instance isn't cut off mid-stream at the default serverless limit.
   - **Leading suspect for the disconnect is a mid-stream RECITATION block** (corpus is RECITATION-prone; route ran `flash` @ temp 0.2 with no block handling). The new logging will confirm on next repro — watch the `npm run dev` console for the `finishReason=` line.

**Verification:** `npm run test` 42/42 pass; `npx tsc --noEmit` clean. `npm run lint` errors are all pre-existing in leftover code (`reader/`, `suggestions/`, `mcp-demo/`) — none in the three touched files.

### Intervening commits since the 2026-05-25 redesign (not previously logged)

- `5246c5f feat: refine chat shell with bolder "Institutional Confidence" look` — design language now codified in memory as serif headlines + deep green/brass; reuse `--vp-*` tokens, don't add new accents.
- `264b098 chore: add skills tooling (skills-lock.json, ignore .gstack/)`.
- `442bb21 refactor: extract chat prompts to lib/prompt.ts; make system prompt conversational` — `SYSTEM_INSTRUCTION`, `buildRefinementPrompt`, `buildUserPrompt` moved to [apps/web/src/lib/prompt.ts](apps/web/src/lib/prompt.ts) as the single source of truth for chatbot voice. **Edit prompts there, not in route.ts.**

### What landed earlier (2026-05-25)

**Tier-1 corpus fully ingested into Supabase:**

| Perda | Path | Pasals | OCR method |
|-------|------|--------|------------|
| 4/2020 Retribusi Parkir *(repealed by 1/2024 — see validity layer)* | inline | 3 | older smart_ocr run |
| 2/2021 Pajak Sarang Burung Walet *(repealed by 1/2024)* | inline (7MB) | 34 | Pro+0.4 |
| 1/2024 Pajak & Retribusi Daerah | chunked (42MB) | 125 | [chunk_ocr_perda1.py](scripts/loader/chunk_ocr_perda1.py) |
| 6/2025 Pencegahan Narkotika | inline (11MB) | 56 | Pro+0.4 |

**Totals:** 442 `document_nodes`, 239 embedded (structural BAB/Bagian nodes correctly skipped).

### Git state

- **`main`** has one new commit: `78add34 chore: bump UI version label to v1.4` (pushed)
- **`chore/wave-1-cleanup`** branch pushed with 3 commits, **PR not yet opened**:
  - `15beaef feat: harden Bolmong OCR pipeline for large + recitation-prone Perdas`
  - `47234a6 docs: add CLAUDE.md and Bolmong cleanup roadmap`
  - `fdeb744 chore: wave 1 cleanup — remove pasal.id leftover scaffolding`
- PR creation URL: **https://github.com/leperdanforok/vector-pasal/pull/new/chore/wave-1-cleanup**
- PR title + body draft is in the AM session's last chatbot message — paste verbatim.
- **`redesign/vp-chat-shell`** branch pushed with 2 commits, **PR not yet opened** (PM session, see redesign section below):
  - `feat: apply Vector Pasal redesign visual refresh (autorekap design package)`
  - `docs: log redesign session in handoff`
- Redesign PR creation URL: **https://github.com/leperdanforok/vector-pasal/pull/new/redesign/vp-chat-shell**

### PM session — Vector Pasal redesign (2026-05-25 continued)

User opened a design package URL from Anthropic Claude Design (`https://api.anthropic.com/v1/design/h/hCdsPI9cY240LQhloWBUEQ`) — a gzipped bundle named **autorekap-design-system** containing the **Vector Pasal Redesign.html** mock plus React components, color tokens, and a SKILL.md handoff manifest.

**Scope chosen:** *visual-only refresh* (two-screen Welcome → Chat architecture preserved, no structural rewrite). New branch `redesign/vp-chat-shell` off `main` (does NOT include Wave 1 cleanup — those are independent PRs).

**Files touched on the redesign branch:**
- [apps/web/src/app/layout.tsx](apps/web/src/app/layout.tsx) — added **Figtree** (body) + **Newsreader** (serif for source text) via `next/font/google`. Exposed `--font-figtree` and `--font-newsreader` on `<body>`.
- [apps/web/src/app/globals.css](apps/web/src/app/globals.css) — appended VP design tokens (`--vp-*` for bg / surface / primary / user-bubble / borders / shadows; both light and dark variants) plus ~440 lines of `.vp-*` class definitions that consume those tokens. Existing `oklch`-based palette left intact.
- [apps/web/src/app/[locale]/page.tsx](apps/web/src/app/[locale]/page.tsx) — full visual rewrite (627 → 559 lines). Replaced all `${isDarkMode ? ... : ...}` Tailwind ternaries with `.vp-*` classes that read from CSS variables. The `.dark` class is now toggled on `<html>` so variables flip automatically. Inline Lucide-style SVG `Icon` component replaces `next/image` for header/avatars/buttons.

**Visual outcome:**
- Cream `#F7F7F3` background, forest-green `#1F7A5E` primary, sage-mint dark mode `#34D399`.
- Header: sticky 64px white surface, hamburger left, brand center, new-chat right (only when chat started).
- Welcome screen (`!isChatStarted`): scale-icon disc, "ASISTEN HUKUM AI" eyebrow, balanced heading, divider, 4 **Bolmong-specific** suggestion chips (Perda 2/2021 walet tarif, SPTPD sanksi, Perda 6/2025 narkotika hotel, Perda 4/2020 retribusi parkir). Footer: `Vector Pasal v1.4 · Develop by Viddie Pilat`.
- Chat messages: green user bubbles right-aligned with checkmark + timestamp; AI messages with scale-icon avatar + "Vector Pasal" name + markdown body.
- Source cards: 3px left-border accent, primary-light fill, Newsreader serif body text, "Selengkapnya"/"Tutup" toggle + "Buka Dokumen" open-external action.
- Pill-shaped input bar with gradient fade above it; send button activates (green fill, scale on hover) when query is non-empty.
- Three modals refreshed (Document detail / Panduan / Tentang) to match the design's clean white-surface treatment.

**What's preserved exactly:**
- `/api/chat` NDJSON streaming logic (text + sources frames) — handler is byte-identical.
- localStorage keys `vp_chat_history` and `vp_theme` — backward-compatible.
- Two-screen split (Welcome with CTA → Chat) so existing user flow doesn't shift.

**Build/lint:**
- `npm run build` ✓ compiled in 61s, all 36 routes generated.
- `npm run lint`: 26 problems (16 errors / 10 warnings), down from 41 before the rewrite. **All remaining are pre-existing in leftover code** (`reader/`, `suggestions/`, `mcp-demo/`) — none introduced.

**Suggestion chip behavior:** clicking a chip calls `submitQuery(chipText)` which sets `isChatStarted=true` and fires the query to `/api/chat` immediately. No intermediate "review the chip" step.

## What's working

- **OCR pipeline (smart_ocr.py)** — Gemini 2.5 Pro at temp 0.4 with softened prompt, 3-attempt retry loop (5s/15s/30s) for transient 503/429. Handles both inline (<20MB) and File API (≥20MB) paths.
- **Chunked OCR fallback** — `chunk_ocr_perda1.py` splits 42MB PDFs into 10-page slices, OCRs each, concatenates. Per-chunk markdown cache makes re-runs idempotent.
- **Markdown→raw-text normalizer** — `_normalize_markdown_for_parser()` in [load_to_supabase.py](scripts/loader/load_to_supabase.py) strips `#+ ` heading prefixes and `**bold**` so `parse_structure.py` can find BAB/Pasal markers.
- **Hybrid retrieval + sanction expansion** (migration 059) — confirmed at ingestion level and re-exercised end-to-end during the 2026-06-04 validity work (walet/parkir/narkotika).
- **Memory persistence** — three structured memories saved with the non-obvious lessons: `bolmong-corpus-tier1`, `gemini-recitation-mitigation`, `markdown-parser-normalization`.

## What's blocked / not yet done

- **Sanity queries** (validity-correct expectations; codified in the gold set — see `apps/web/gold/`):
  - *"Berapa tarif pajak sarang burung walet?"* → live **Perda 1/2024 Pasal 56** (10%). Perda **2/2021 appears only as a demoted `repealed_with_successor` reference**, never as the answer.
  - *"Apa sanksi jika tidak melaporkan SPTPD?"* → the **live** answer from **Perda 1/2024** (exact Pasal = legal ground truth, TBD). NOT 2/2021 Pasal 33 — that sanction lives in a repealed work.
  - *"Apa kewajiban pemilik hotel terkait narkotika?"* → **Perda 6/2025 Pasal 25** (live; unchanged).
  - *"Bagaimana retribusi parkir dihitung?"* → live **Perda 1/2024** (PBJT/retribusi). Must **NOT** return Perda 4/2020's flat tariffs (Rp2.000–8.000) — those are repealed.
- **Wave 1 PR not yet opened** — `gh` CLI is not installed, so user must open via the URL above.
- **Wave 2 cleanup deferred** — leftover web routes (`/jelajahi`, `/peraturan`, `/topik`, `/search`, `/admin/*`) and their corresponding components/API routes. Plan exists in [VECTOR_PASAL_CLEANUP_PLAN.md](VECTOR_PASAL_CLEANUP_PLAN.md).
- **Lint baseline**: 26 errors + 15 warnings in `apps/web` — all in leftover code (`suggestions/`, `reader/`, `mcp-demo/`). Will go away naturally as Waves 2-3 delete those surfaces.

## Files touched this session

**Modified (committed on `chore/wave-1-cleanup`):**
- [scripts/loader/smart_ocr.py](scripts/loader/smart_ocr.py) — Pro model, temp 0.4, softened prompt, retry loop
- [scripts/loader/load_to_supabase.py](scripts/loader/load_to_supabase.py) — `_normalize_markdown_for_parser()` + `import re`
- [.gitignore](.gitignore) — added `scratch/`, `*.log`, `ocr_pipeline_log.txt`, `data/raw_pdf/`, `data/transcriptions/`, `data/parsed/`
- [CLAUDE.md](CLAUDE.md) — fixed `server.json` mislabel on line 120, removed deleted-file references in Leftover section

**Modified (committed on `main`):**
- [apps/web/src/app/[locale]/page.tsx](apps/web/src/app/[locale]/page.tsx) — v1.3 → v1.4 strings

**Created:**
- [scripts/loader/chunk_ocr_perda1.py](scripts/loader/chunk_ocr_perda1.py) — one-off chunker for the 42MB pajak Perda
- [CLAUDE.md](CLAUDE.md) — repo guidance for Claude Code + Active/Leftover map (was previously untracked)
- [VECTOR_PASAL_CLEANUP_PLAN.md](VECTOR_PASAL_CLEANUP_PLAN.md) — phased cleanup roadmap (was previously untracked)

**Deleted (tracked, in `fdeb744`):**
- `server.json` — unused MCP manifest with invalid JSON
- `scripts/load_uu_6_2023.py` — one-off national law loader, no Bolmong relevance

**Deleted (untracked workspace cleanup):**
- `scripts/ocr_test_chandra.py`, `ocr_test_gemini.py`, `ocr_test_ollama.py`, `ocr_test_surya.py`
- `ocr_pipeline_log.txt`, `scripts/ocr_pipeline_log.txt`
- `scratch/`

## Notes for next session

### Immediate next steps (in order)

1. **Open the Wave 1 PR** via `https://github.com/leperdanforok/vector-pasal/pull/new/chore/wave-1-cleanup`. PR body draft is in the AM session's chat log; paste verbatim.
2. **Open the redesign PR** via `https://github.com/leperdanforok/vector-pasal/pull/new/redesign/vp-chat-shell`. This is independent of Wave 1 (branched from `main` directly), so the two PRs can land in either order. Suggested PR body: "Apply Vector Pasal visual redesign from autorekap design package — two-screen architecture preserved, new color palette / Figtree+Newsreader fonts / pill input / forest-green source cards / suggestion chips."
3. **Dogfood the chatbot** with the 4 sanity queries listed under "Blocked" above — ideally on the redesign branch deployment so you can confirm both the retrieval works AND the new UI renders correctly. Check the PR test-plan checkbox once done.
4. **Merge Wave 1 and the redesign** (squash or merge as preferred — commits are intentionally separate for readability).

### Wave 2 scope when ready

Delete leftover web routes — none of these are consumed by the Bolmong chatbot:
- `apps/web/src/app/[locale]/jelajahi/`, `peraturan/`, `topik/`, `search/`
- `apps/web/src/app/admin/peraturan/`, `admin/scraper/`, `admin/suggestions/`
- Plus corresponding components: `reader/`, `landing/`, `connect/`, suggestions/
- Plus API routes: `/api/v1/*`, `/api/laws/*`, `/api/admin/*`, `/api/suggestions/*`

After Wave 2, lint errors should drop to near-zero (the 26 current errors all live in those surfaces). Build will catch any accidental imports of deleted files — that's the safety net.

### Recipes worth remembering (also in memory)

- **RECITATION block on Gemini OCR?** → Pro model + temp 0.4 + soften "transcribe verbatim" to "extract for indexing". If still blocked at large scale → chunk into 10-page slices. Don't waste retries at the same scale; RECITATION is content-overlap-based, not sampling-randomness-based.
- **New transcribed Perda parsing as 1 blob with 0 pasals?** → The markdown normalizer in `load_to_supabase.py` is the load-bearing piece. If you change `smart_ocr.py` to emit new Markdown constructs (lists, tables, blockquotes), confirm the normalizer still produces parser-compatible output.
- **Adding Perdas?** → Follow the **3-step Definition of Done in [CLAUDE.md](CLAUDE.md#ingesting-a-new-perda--definition-of-done)** (embed → map validity relations → gold cases). Embedding alone (step 1) is NOT "done" — skipping the validity step reintroduces dead-law-served-as-live. Quick notes: verify pasal count matches expectation (printed to stdout); all current corpus PDFs (1/2024, 2/2021, 4/2020, 6/2025) are in `data/raw_pdf/` with transcription caches in `data/transcriptions/`, so `smart_ocr.py` skips them on re-run; Trantibum 3/2023 is already ingested (work id 2, 178 nodes) via its cached transcription, PDF not in `data/raw_pdf/`.

### Don't trip on these

- The repo's CLAUDE.md says to use `.\venv\Scripts\python.exe`, but no `venv` directory exists at the repo root — the user runs Python from a different install. If commands fail, just use plain `python`.
- `gh` CLI is not installed — opening PRs is manual via GitHub web.
- This repo is on Windows; PowerShell tool is the right shell for filesystem ops, not Bash (which doesn't understand Windows paths in many cases).
- The MCP server at `apps/mcp-server/` is deployed to Railway and works, but the connect-page material at `apps/web/src/components/connect/` and `apps/web/src/lib/mcp-demo/` is leftover marketing UI — don't extend without checking with user first.
