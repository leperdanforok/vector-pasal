# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vector Pasal — an AI legal-assistant RAG for **Satpol PP Kabupaten Bolaang Mongondow**. Indonesian Regional Regulations (Perda) for Bolmong are ingested into Postgres with pgvector, then queried through a hybrid (vector + FTS + trigram) search and grounded with Gemini.

**Important: this repo is a fork of [pasal.id](https://pasal.id)** (a general Indonesian legal database) that has been narrowed to the Bolmong Satpol PP use case. Large portions of the original pasal.id codebase are **inactive leftovers** that haven't been removed yet. When making changes, first check whether the surface you're touching is Bolmong-active or leftover — see the map below — and confirm with the user before doing significant work in a leftover area.

Cleanup is tracked in [VECTOR_PASAL_CLEANUP_PLAN.md](VECTOR_PASAL_CLEANUP_PLAN.md) (Phase 1 started, most of Phases 1–5 still TODO as of writing — the structural changes it proposes are *not yet applied*; the doc describes intent, not current state).

## What's active vs. leftover

### Active (Bolmong build)
- **Web chatbot** — the homepage at [apps/web/src/app/[locale]/page.tsx](apps/web/src/app/[locale]/page.tsx) is the Satpol PP chat UI.
- **Chat API** — [apps/web/src/app/api/chat/route.ts](apps/web/src/app/api/chat/route.ts) (RAG pipeline; see Architecture below).
- **Manual ingestion** — drop PDFs into `data/raw_pdf/`, run [scripts/loader/smart_ocr.py](scripts/loader/smart_ocr.py) (Gemini-based OCR with Markdown cache in `data/transcriptions/`), then [scripts/load_perda_bolmong.py](scripts/load_perda_bolmong.py) to parse, embed in batches of 100, and upsert into Supabase.
- **Schema** — [packages/supabase/migrations/](packages/supabase/migrations/) (`001` through `059`+). All migrations are still in force regardless of which surface uses them.
- **MCP server** — [apps/mcp-server/](apps/mcp-server/) is functional and deployed to Railway (see [apps/mcp-server/CLAUDE.md](apps/mcp-server/CLAUDE.md)). The cleanup plan proposes moving it to `scripts/mcp-server/`, but that hasn't happened.

### Leftover from pasal.id (don't extend without checking)
- **Public regulation browser** — the `/jelajahi`, `/peraturan`, `/topik`, `/search` routes under [apps/web/src/app/[locale]/](apps/web/src/app/[locale]/) and their components (`reader/`, `landing/`, `SearchBar`, `SearchFilters`, `LawTypeChips`, `StatsBar`, `TableOfContents`, `CitationButton`, etc.).
- **Admin/scraper UI** — `/admin/peraturan`, `/admin/scraper`, `/admin/suggestions` ([apps/web/src/app/admin/](apps/web/src/app/admin/)) and corresponding `/api/admin/*` routes. Designed for a broader corpus + community corrections workflow, not used by Satpol PP.
- **MCP connect page + demo** — [apps/web/src/components/connect/](apps/web/src/components/connect/) and [apps/web/src/lib/mcp-demo/](apps/web/src/lib/mcp-demo/) — landing material for the Claude integration.
- **Public API v1** — [apps/web/src/app/api/v1/](apps/web/src/app/api/v1/) (search + laws endpoints) and [apps/web/src/app/api/laws/](apps/web/src/app/api/laws/). Not consumed by the Bolmong chatbot.
- **Suggestions system** — [apps/web/src/app/api/suggestions/](apps/web/src/app/api/suggestions/), [apps/web/src/components/suggestions/](apps/web/src/components/suggestions/), Gemini-based verification in [scripts/agent/](scripts/agent/), migrations 017/022/031/045/046/047.
- **Crawler pipeline** — the entire automated peraturan.go.id crawler in [scripts/crawler/](scripts/crawler/), [scripts/worker/](scripts/worker/), [scripts/parser/](scripts/parser/). Bolmong ingestion does **not** use this — it uses the smart_ocr + `load_perda_bolmong.py` flow. [scripts/CLAUDE.md](scripts/CLAUDE.md) documents this crawler pipeline in detail, but be aware most of what it describes is not on the Bolmong critical path.
- **One-off national-law loaders** — `scripts/load_uud.py`, `scripts/seed_relationships.py`. Useful as references but not Bolmong content.
- **`graphify-out/`** — graphify output, gitignored.

When the user asks about ingestion, default to the smart_ocr + `load_perda_bolmong.py` path unless they explicitly mention the crawler.

## Commands

### Web app ([apps/web/](apps/web/))
```bash
npm install
npm run dev          # next dev
npm run build        # next build
npm run lint         # eslint
npm run test         # vitest run (vitest, not jest)
```
Single test: `npx vitest run src/lib/__tests__/parse-slug.test.ts`

### Bolmong ingestion (run from repo root, on Windows use the in-repo venv)
```bash
.\venv\Scripts\python.exe scripts/loader/smart_ocr.py        # OCR new PDFs in data/raw_pdf/ → data/transcriptions/
.\venv\Scripts\python.exe scripts/load_perda_bolmong.py      # Parse, embed, upsert into Supabase
# --dry-run on load_perda_bolmong.py parses without writing
.\venv\Scripts\python.exe scripts/loader/load_to_supabase.py --seed-validity  # Seed validity relations (strict, fail-loud)
```
**Embedding the text is only step 1 of 3.** A Perda is not "ingested" until validity relations are mapped — see [Ingesting a new Perda — Definition of Done](#ingesting-a-new-perda--definition-of-done) below. Skipping the validity step silently reintroduces dead-law-served-as-live, the exact bug the validity layer prevents.

Fresh start (Supabase SQL Editor):
```sql
TRUNCATE TABLE work_relationships, document_nodes, works RESTART IDENTITY CASCADE;
```

### MCP server ([apps/mcp-server/](apps/mcp-server/))
```bash
python server.py                    # streamable-http on $PORT (default 8000)
python -m pytest test_server.py -v
```

### Crawler worker (leftover, run from repo root)
Documented in [scripts/CLAUDE.md](scripts/CLAUDE.md). Don't extend without confirming the user actually wants the crawler path.

## Ingesting a new Perda — Definition of Done

A Perda is **NOT "ingested" until steps 1–3 are all complete.** Step 2 is the one most likely to be skipped because the system *looks* finished after step 1 — but skipping it silently reintroduces dead-law-served-as-live, the exact bug the validity layer exists to prevent. Embedding without relations is **dangerous, not partial.**

### Step 1 — Embed the text (technical, delegable to the pipeline)
- [ ] Drop PDF in `data/raw_pdf/`, run `smart_ocr.py`, then `load_perda_bolmong.py`.
- [ ] Verify the pasal count printed to stdout matches the actual Perda (catches truncated/blob parses).
- [ ] Spot-check that numbers/tariffs survived OCR — compare a few against the source scan, especially rupiah figures and cross-references ("sebagaimana dimaksud Pasal X").

### Step 2 — Map validity relations (MANDATORY — legal work, human only, NEVER inferred by the LLM)
- [ ] Read the new Perda's **Ketentuan Penutup**. Does it repeal (`mencabut`) or amend (`mengubah`) anything?
- [ ] For each repeal/amend, add the edge to `work_relationships` (`mencabut`/`dicabut_oleh`, `mengubah`/`diubah_oleh`) via the **strict, fail-loud loader path** — add entries to `_BOLMONG_WORK_EDGES` / `_BOLMONG_REGISTER` / `_BOLMONG_REGISTER_EDGES` in [scripts/loader/load_to_supabase.py](scripts/loader/load_to_supabase.py), then run `load_to_supabase.py --seed-validity`. Never hand-insert via SQL — the strict loader raises on any URI miss instead of SKIPping.
- [ ] If the new Perda is itself repealed/amended by something **not in the corpus** → add that other regulation to `regulation_register` (the `out_of_coverage` source) and point the edge at it.
- [ ] **Reverse check (easy to miss):** does anything already in the corpus get repealed/amended by this new Perda, or vice versa? A newer Perda most often changes the validity map of *older* ones — re-examine, don't assume.
- [ ] Re-run the seed; confirm the **post-seed edge-count assertion** passes (it fails the step if short).

### Step 3 — Add gold cases (JUDGMENT — only for high-stakes content)
- [ ] Ask: does this Perda introduce a number (tariff/fine/sanction), a repeal/amend relation, or cover a high-enforcement domain (trantibum, ketertiban umum)?
- [ ] If yes → add 1–2 cases to [apps/web/gold/cases.ts](apps/web/gold/cases.ts) targeting the sharpest points. Fill `expected.*` by **reading the Perda** (never auto-populate). Add `must_not_contain` for any dead figure that must never resurface. Run `npm run test:gold`.
- [ ] If the Perda is purely administrative with no enforcement numbers → no gold case. Don't pad the suite.

### Never
- **Never** let the LLM decide repeal/validity status — it comes from `work_relationships` only, rendered deterministically in code ([apps/web/src/lib/validity.ts](apps/web/src/lib/validity.ts)).
- **Never** mark ingest "done" after step 1 alone.
- **Never** auto-fill gold `expected.*` to make a test pass — a red test from a wrong retrieval is a *finding*, not a nuisance.

## Architecture: the chat request

[apps/web/src/app/api/chat/route.ts](apps/web/src/app/api/chat/route.ts) is the canonical example. Four stages:

1. **Query refinement + embedding (parallel)** — Gemini `gemini-2.5-flash` rewrites the user query into clean legal keywords (typo fixes, strip question words); simultaneously `gemini-embedding-001` embeds the *original* query at `outputDimensionality: 768`. Refined text is used for FTS, original embedding for vector search.
2. **Hybrid retrieval (parallel)** — two RPCs:
   - `match_legal_chunks` — vector cosine over `document_nodes.embedding`, threshold `0.1` (intentionally lenient — the LLM is the final relevance filter).
   - `search_legal_chunks` — FTS (Indonesian config) + trigram fallback, with **sanction expansion** (migration 059) that pulls penalty/sanction nodes (`denda`, `pidana`, `sanksi`) from any matched `works` row even when those nodes don't share keywords with the query. Prohibition and penalty often live in different Pasals; this is what makes "what's the fine for X" answerable.
   Results are merged and deduplicated by `node_id`.
3. **RAG context build** — top matches are concatenated with `[Perda No N/YYYY, Pasal X]` reference headers; content is truncated to 2000 chars per node.
4. **Grounded generation** — `gemini-2.5-flash` streams the answer under a strict Indonesian system prompt instructing it to cite Pasal numbers and refuse to invent rules.

The response is NDJSON: `{type: 'text', data: …}` chunks during streaming, then a final `{type: 'sources', data: …}` frame. Sources are filtered post-stream by which Pasals the model actually cited (regex over the streamed text), falling back to top-3 if no citations were found.

Constants to keep in sync if you touch any of this:
- Embedding dim `768` — must match the `vector(768)` column. `gemini-embedding-001` defaults higher, so always pass `outputDimensionality: 768`.
- Vector threshold `0.1`, match count `15+15` — don't tighten without also adjusting LLM-side filtering.
- Search function: don't revert `search_legal_chunks` to the pre-059 strict `AND` (`&&` tsquery) form — partial matches and sanction expansion both depend on the `UNION ALL` shape.

## Architecture: the data model

There is **no separate chunks table**. The single source of truth for retrieval is `document_nodes`:
- Hierarchical tree (BAB → Bagian → Paragraf → Pasal → Ayat), self-referential via `parent_id`.
- `content_text` is raw text; `fts` is a `GENERATED ALWAYS` TSVECTOR; `embedding` is `vector(768)`.
- `search_legal_chunks()` only queries content-bearing node types (`pasal`, `ayat`, `preamble`, `content`, `aturan`, `penjelasan_umum`, `penjelasan_pasal`) — structural nodes (`bab`, `bagian`, `paragraf`) are skipped.
- `works` holds regulation metadata (type, number, year, region, slug, source_pdf_url).
- `regulation_types` is loaded lazily and cached. Bolmong content is `PERDA_KAB`.
- **Validity layer (active):** `work_relationships` holds repeal/amend edges between works (or to a `regulation_register` entry for known-but-absent regulations); these are the **single source of truth for legal validity**, never the LLM. Retrieval tags each result via `get_repeal_facts()` → [apps/web/src/lib/validity.ts](apps/web/src/lib/validity.ts), and the chat route withholds repealed-but-superseded articles from the model. `works.status` is **not** authoritative (commented as such in the schema). See the ingestion Definition of Done above.
- The crawler-era tables (`crawl_jobs`, `discovery_progress`, `scraper_runs`, `pdf_tracking`) exist in the schema but are unused by the Bolmong ingestion flow.

## Web app shape

- **Next.js 16 App Router** with `next-intl` for `id`/`en` locales. Routing in [apps/web/src/i18n/routing.ts](apps/web/src/i18n/routing.ts) — default `id`, `localePrefix: "as-needed"` (Indonesian URLs have no `/id` prefix; English URLs are `/en/...`). Admin and API routes bypass the locale middleware ([apps/web/src/middleware.ts](apps/web/src/middleware.ts)).
- **Supabase clients** split by trust level in [apps/web/src/lib/supabase/](apps/web/src/lib/supabase/):
  - `client.ts` — browser (anon key)
  - `server.ts` — RSC/route handlers with cookies (anon key, respects RLS)
  - `service.ts` — service-role key, `server-only`-marked, bypasses RLS. Used by `/api/chat`.
- **Admin auth** is email-allowlist via the `ADMIN_EMAILS` env var (comma-separated). See [apps/web/src/lib/admin-auth.ts](apps/web/src/lib/admin-auth.ts) — `requireAdmin()` redirects to `/admin/login` if the Supabase session email isn't on the list. No roles table. (Note: the admin UI itself is largely leftover.)
- **PWA** via Serwist — custom worker at [apps/web/src/app/sw.ts](apps/web/src/app/sw.ts), output to `public/sw.js`. Disabled in dev via `next.config.ts`.
- **CSP** is set in [apps/web/next.config.ts](apps/web/next.config.ts) — `connect-src` only allows `*.supabase.co`/`*.supabase.in`. If you add a third-party browser fetch, update the CSP.

## Environment

Each surface has its own `.env`:
- `apps/web/.env` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `ADMIN_EMAILS`.
- `apps/mcp-server/.env` — `SUPABASE_URL`, `SUPABASE_ANON_KEY` (read-only; server raises at startup if missing).
- `scripts/.env` (or project-root `.env` used by `smart_ocr.py`) — `SUPABASE_URL`, `SUPABASE_KEY` (service role), `GOOGLE_API_KEY` (or `GEMINI_API_KEY` for crawler agents).

Web uses `NEXT_PUBLIC_SUPABASE_URL`; Python surfaces use `SUPABASE_URL`. Don't rename either when wiring something new.

## Deployment

- Web → Vercel ([apps/web/vercel.json](apps/web/vercel.json)).
- MCP server → Railway ([apps/mcp-server/railway.json](apps/mcp-server/railway.json), Dockerfile).
- Crawler worker → Railway as a `continuous` service (leftover; only relevant if you reactivate the crawler).
- Root `railway.json` builds the crawler worker (`scripts/worker/Dockerfile`) on Railway. Only relevant if the crawler is reactivated.

## Gotchas

- **Migrations are append-only and numbered.** Don't edit a shipped one — add a new one. Two pairs share a number prefix (`030_*`, `039_*`) — preserve that ordering when adding more.
- **`localePrefix: "as-needed"`** means internal links must use the `next-intl` `Link` from [apps/web/src/i18n/routing.ts](apps/web/src/i18n/routing.ts) — raw `next/link` will mis-resolve EN routes.
- **The cleanup plan is aspirational.** [VECTOR_PASAL_CLEANUP_PLAN.md](VECTOR_PASAL_CLEANUP_PLAN.md) describes a target architecture (services layer, demo isolation, MCP relocation) that is **not yet implemented**. The current directory layout is the pre-cleanup state.
- **History docs are useful when something looks wrong.** [VECTOR_PASAL_PROJECT_KNOWLEDGE.md](VECTOR_PASAL_PROJECT_KNOWLEDGE.md) and [VECTOR_PASAL_OPTIMIZATION_REPORT.md](VECTOR_PASAL_OPTIMIZATION_REPORT.md) document past debugging journeys (the "Not Found" mystery, missing fines, SDK migration, v1.4 perf work). Check there before "fixing" a quirky-looking decision.
