# Vector Pasal — Session Handoff

*Last session: 2026-05-25 (two sessions on the same day — ingestion+cleanup AM, redesign PM)*

## Project goals

AI legal-assistant RAG for **Satpol PP Kabupaten Bolaang Mongondow**. Indonesian Regional Regulations (Perda) for Bolmong are ingested into Postgres + pgvector, queried through a hybrid (vector + FTS + trigram) search, and grounded with Gemini for citation-faithful Indonesian-language answers.

This repo is a Bolmong-narrowed **fork of [pasal.id](https://pasal.id)**. ~40% of the codebase is leftover scaffolding from the original general-purpose Indonesian legal database. Active vs. leftover map lives in [CLAUDE.md](CLAUDE.md).

## Current state

### What landed this session (2026-05-25)

**Tier-1 corpus fully ingested into Supabase:**

| Perda | Path | Pasals | OCR method |
|-------|------|--------|------------|
| 4/2020 Retribusi Parkir | inline | 3 | older smart_ocr run |
| 2/2021 Pajak Sarang Burung Walet | inline (7MB) | 34 | Pro+0.4 |
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
- **Hybrid retrieval + sanction expansion** (migration 059) — confirmed at ingestion level; not re-dogfooded since the ingestion fix landed.
- **Memory persistence** — three structured memories saved with the non-obvious lessons: `bolmong-corpus-tier1`, `gemini-recitation-mitigation`, `markdown-parser-normalization`.

## What's blocked / not yet done

- **Manual chatbot dogfood not run** post-ingestion. Sanity queries to fire before merging the cleanup PR:
  - *"Berapa tarif pajak sarang burung walet?"* → expect Perda 2/2021 Pasal 6 citation (10%)
  - *"Apa sanksi jika tidak melaporkan SPTPD?"* → expect Perda 2/2021 Pasal 33 citation (also tests sanction expansion)
  - *"Apa kewajiban pemilik hotel terkait narkotika?"* → expect Perda 6/2025 Pasal 25
  - *"Bagaimana retribusi parkir dihitung?"* → expect Perda 4/2020
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
- **Adding Perdas?** → Drop PDF in `data/raw_pdf/`, run `smart_ocr.py`, then `load_perda_bolmong.py`. Verify pasal count matches expectation (it's printed to stdout). Trantibum (Perda 3/2023) and parkir (Perda 4/2020) PDFs are NOT in `data/raw_pdf/` so they stay untouched on re-runs.

### Don't trip on these

- The repo's CLAUDE.md says to use `.\venv\Scripts\python.exe`, but no `venv` directory exists at the repo root — the user runs Python from a different install. If commands fail, just use plain `python`.
- `gh` CLI is not installed — opening PRs is manual via GitHub web.
- This repo is on Windows; PowerShell tool is the right shell for filesystem ops, not Bash (which doesn't understand Windows paths in many cases).
- The MCP server at `apps/mcp-server/` is deployed to Railway and works, but the connect-page material at `apps/web/src/components/connect/` and `apps/web/src/lib/mcp-demo/` is leftover marketing UI — don't extend without checking with user first.
