# How It Works

## Architecture Overview

Vector Pasal uses a **Retrieval-Augmented Generation (RAG)** pipeline: the user's question is used to search a database of regulation text, and the most relevant passages are fed to a language model (Google Gemini) which generates a grounded answer citing specific Pasal numbers.

```
User question (Bahasa Indonesia)
       │
       ▼
┌──────────────────────────────┐
│  1. Query Refinement         │  Gemini rewrites the query into
│     + Embedding (parallel)   │  clean legal keywords; embedding
│                              │  generated for vector search
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  2. Hybrid Retrieval         │  Two parallel database searches:
│     • Vector cosine search   │  - match_legal_chunks (embedding)
│     • FTS + trigram search   │  - search_legal_chunks (keywords)
│     + Sanction expansion     │  Results merged & deduplicated
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  3. Validity Filtering       │  Repealed regulations tagged via
│                              │  work_relationships edges, not AI.
│                              │  Superseded content suppressed.
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  4. Grounded Generation      │  Gemini streams answer in Indonesian,
│                              │  citing [Perda X/YYYY, Pasal N].
│                              │  Refuses to invent rules.
└──────────────────────────────┘
       │
       ▼
  Answer + Source citations
```

## Data Model

All regulation text lives in a single table: **`document_nodes`**.

Each regulation is parsed into a hierarchical tree:

```
works (regulation metadata)
  └── document_nodes
        ├── BAB (chapter)
        │     ├── Bagian (section)
        │     │     ├── Paragraf (paragraph)
        │     │     │     ├── Pasal (article)     ← searchable
        │     │     │     │     ├── Ayat (clause)  ← searchable
        │     │     │     │     └── ...
        │     │     │     └── ...
        │     │     └── ...
        │     └── ...
        ├── Lampiran (appendix/tariff tables)       ← searchable
        └── Preamble, Penjelasan                    ← searchable
```

Structural nodes (BAB, Bagian, Paragraf) provide hierarchy but are **not searched** — only content-bearing nodes (Pasal, Ayat, Lampiran, Preamble, Penjelasan) appear in search results.

Each searchable node has:
- **`content_text`** — the raw regulation text
- **`embedding`** — a 768-dimensional vector from `gemini-embedding-001`
- **`fts`** — a full-text search index (auto-generated, Indonesian config)

## Validity Layer

Legal validity (live, repealed, amended) is **never determined by the AI**. It comes from explicit edges in the `work_relationships` table:

- **`mencabut`** — Source regulation repeals target regulation
- **`dicabut_oleh`** — Reverse: target is repealed by source
- **`mengubah`** — Source amends target
- **`diubah_oleh`** — Reverse: target is amended by source

These edges are mapped by a human reading each regulation's **Ketentuan Penutup** (closing provisions). The chat pipeline uses these edges to:

1. Tag each search result with its validity state (live, repealed, amended)
2. Suppress repealed-and-superseded content from the AI context
3. Show validity badges on source citations in the UI

## Search: Why Hybrid?

No single search method handles all legal question types well:

| Method | Good at | Weak at |
|--------|---------|---------|
| **Vector search** | Semantic similarity ("what are the hotel obligations for drugs?") | Exact numbers, specific legal terms |
| **Full-text search (FTS)** | Exact keywords ("SPTPD", "Pasal 116") | Paraphrased questions, synonyms |
| **Trigram matching** | Typos, partial words ("retribusy" → "retribusi") | Semantic meaning |

By running all three in parallel and merging results, the system handles natural language questions, technical legal queries, and misspelled input.

### Sanction Expansion

A special retrieval feature: when a query matches a regulation, the system also pulls in **sanction/penalty nodes** from that same regulation — even if those nodes don't share keywords with the query. This is critical because Indonesian regulations typically put the prohibition in one Pasal and the penalty in a different Pasal. Without expansion, "what's the fine for X?" would find the prohibition but miss the actual fine amount.

## Response Format

The chat API streams NDJSON:

1. **During generation:** `{type: 'text', data: '...'}` chunks
2. **After completion:** `{type: 'sources', data: [...]}` — only sources the model actually cited (detected by regex matching Pasal references in the streamed text)

If the model didn't cite any specific Pasal, the system falls back to the top-3 search results as sources.

## Privacy & Analytics

- **Chat queries are logged** to `chat_logs` with salted session hashing (no user identity stored)
- **PII scrubbing** runs on queries before logging
- **GA4 analytics** are consent-gated — no tracking without user opt-in
- **90-day retention** — chat logs are automatically purged after 90 days
