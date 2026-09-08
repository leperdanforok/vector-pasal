# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vector Pasal — an AI legal-assistant RAG for **Satpol PP Kabupaten Bolaang Mongondow**. Indonesian Regional Regulations (Perda) for Bolmong are ingested into Postgres with pgvector, then queried through a hybrid (vector + FTS + trigram) search and grounded with Gemini.

**Important: this repo is a fork of [pasal.id](https://pasal.id)** (a general Indonesian legal database) that has been narrowed to the Bolmong Satpol PP use case. Large portions of the original pasal.id codebase are **inactive leftovers** that haven't been removed yet. When making changes, first check whether the surface you're touching is Bolmong-active or leftover — see the map below — and confirm with the user before doing significant work in a leftover area.

A phased cleanup (services layer, demo isolation, MCP relocation) is planned but **not yet applied** — the current layout is the pre-cleanup state. The detailed plan lives in the maintainer's local working notes, not in the repo; ask if you need it.

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
```
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
- **The cleanup plan is aspirational.** A target architecture (services layer, demo isolation, MCP relocation) is planned but **not yet implemented**. The current directory layout is the pre-cleanup state.
- **Some quirky-looking decisions have history behind them** (the "Not Found" mystery, missing fines, SDK migration, v1.4 perf work). The write-ups are in the maintainer's local working notes, not the repo — ask before "fixing" something that looks odd but deliberate.
