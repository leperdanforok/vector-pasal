# Vector Pasal — Cleanup & Restructuring Plan

**Last Updated:** April 30, 2026  
**Status:** In Progress (Phase 1 started)  
**Estimated Duration:** 3–6 hours  
**Focus:** Cleanup + Refactoring (equal priority)

---

## Executive Summary

Vector Pasal is being restructured to:
1. **Clarify scope:** Bolmong-focused legal assistant (not broader Indonesian legal DB)
2. **Simplify architecture:** Extract monolithic API into reusable services
3. **Isolate integrations:** Move demo code and MCP server out of the main app
4. **Improve maintainability:** Add types, organize admin workflows, consolidate docs

**Current Issues:**
- `api/chat/route.ts` is 250+ lines with all logic in one file
- Demo code mixed with production components (`mcp-demo/` → production imports)
- MCP server bundled in `apps/` despite being a separate integration
- Admin workflows scattered across API routes and Python scripts
- Scope confusion (is this for Bolmong or broader Indonesian laws?)

**Desired End State:**
- ✅ Services layer: QueryRefiner, EmbeddingService, HybridSearch, RAGService
- ✅ Demo code: Isolated in `src/lib/demo/`, feature-flagged on `/demo` route
- ✅ MCP server: Moved to `scripts/mcp-server/`, deployable independently
- ✅ Admin workflows: Documented, typed, clearly organized
- ✅ Scope: Explicitly Bolmong-focused in all docs

---

## Phase 1: Decouple MCP Server (30 min)

### Goal
Move MCP from "production web app component" to "optional Claude API integration"

### Steps

#### 1.1 Move Directory
```bash
# From project root
git mv apps/mcp-server scripts/mcp-server
git add .
git commit -m "chore(phase1): move MCP server to scripts/ (separate integration)"
```

**Verification:**
```bash
ls scripts/mcp-server/server.py    # ✅ should exist
ls apps/mcp-server/                # ❌ should NOT exist
```

#### 1.2 Update `scripts/mcp-server/CLAUDE.md`

**Change line 1:**
```markdown
# scripts/mcp-server — FastMCP Server (Claude API Integration)

**Note:** This is a separate application for Claude users. The primary UI for Satpol PP officers is the Next.js web app.

See root [README.md](../../README.md) for web app setup.
```

#### 1.3 Update Root README (Insert before "License" section)

**Add this section:**
```markdown
## 🔧 Optional: Claude API Integration (MCP)

Vector Pasal also provides a separate **Model Context Protocol (MCP) server** for Claude Code/Claude API users.

### Setup MCP Server

1. Navigate to the MCP directory:
   ```bash
   cd scripts/mcp-server
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Start the server:
   ```bash
   python server.py
   ```

   The server runs on `http://localhost:8000` by default.

4. **Deploy to production** (e.g., Railway):
   - Use the included `Dockerfile` and `railway.json`
   - See [scripts/mcp-server/CLAUDE.md](scripts/mcp-server/CLAUDE.md) for deployment details

### Who needs this?

- **Satpol PP officers:** Use the web app above (main interface)
- **Claude API users:** Optional MCP integration for grounded legal research
- **Developers:** Reference the MCP architecture in `scripts/mcp-server/`

The MCP server is **completely independent** from the web app — they don't share code or deployment.
```

#### 1.4 Checklist

- [ ] `apps/mcp-server/` moved to `scripts/mcp-server/`
- [ ] File structure verified (`scripts/mcp-server/server.py` exists)
- [ ] `scripts/mcp-server/CLAUDE.md` updated
- [ ] Root `README.md` updated with MCP section
- [ ] Commit message clear and descriptive
- [ ] No broken imports (MCP is self-contained, so this is mostly just file moves)

---

## Phase 2: Isolate Demo Code (45 min)

### Goal
Remove demo from production component paths and feature-flag it

### Steps

#### 2.1 Create Demo Directory Structure
```bash
mkdir -p apps/web/src/lib/demo
mkdir -p apps/web/src/components/demo
```

#### 2.2 Move Files

| From | To | Notes |
|------|-----|-------|
| `src/lib/mcp-demo/script.ts` | `src/lib/demo/script.ts` | Rename reference from "MCP demo" to "demo" |
| `src/lib/mcp-demo/types.ts` | `src/lib/demo/types.ts` | – |
| `src/lib/mcp-demo/use-animation.ts` | `src/lib/demo/use-animation.ts` | – |
| `src/components/connect/MCPDemo.tsx` | `src/components/demo/DemoPlayer.tsx` | Rename component MCPDemo → DemoPlayer |

**Commands:**
```bash
# Move files
mv apps/web/src/lib/mcp-demo/* apps/web/src/lib/demo/
mv apps/web/src/components/connect/MCPDemo.tsx apps/web/src/components/demo/DemoPlayer.tsx

# Delete old directories
rm -rf apps/web/src/lib/mcp-demo
rm apps/web/src/components/connect/MCPDemo.tsx
```

#### 2.3 Update Imports Everywhere

**Find all files importing from old paths:**
```bash
grep -r "from.*mcp-demo" apps/web/src
grep -r "MCPDemo" apps/web/src
```

**Update:**
- Old: `import { DEMO_SCRIPT } from "@/lib/mcp-demo/script"`
- New: `import { DEMO_SCRIPT } from "@/lib/demo/script"`

- Old: `import MCPDemo from "@/components/connect/MCPDemo"`
- New: `import DemoPlayer from "@/components/demo/DemoPlayer"`

#### 2.4 Create Feature Flag in `.env.example`

**Add:**
```
# Demo mode (Claude MCP demo script, feature-flagged)
NEXT_PUBLIC_SHOW_DEMO=false
```

#### 2.5 Create `apps/web/src/components/demo/README.md`

```markdown
# Demo Components

This folder contains the **Claude MCP demo** — an interactive script showing how Vector Pasal integrates with Claude.

## Files

- **`DemoPlayer.tsx`** — Main demo component (renders steps, tool calls, results)
- **`script.ts`** — Demo workflow (hardcoded example Q&A for MCP)
- **`types.ts`** — TypeScript types for demo steps
- **`use-animation.ts`** — Animation hook for step sequencing

## Feature Flag

To enable the demo in your app, set `NEXT_PUBLIC_SHOW_DEMO=true` in `.env`.

The demo is **not part of the main UX** — it's purely for showcasing the MCP integration.

## See Also

- `scripts/mcp-server/` — The actual MCP server being demoed
```

#### 2.6 Checklist

- [ ] `src/lib/demo/` directory created with files moved
- [ ] `src/components/demo/` directory created with DemoPlayer
- [ ] All imports updated (old `mcp-demo/` → `demo/`)
- [ ] `.env.example` updated with `NEXT_PUBLIC_SHOW_DEMO`
- [ ] Demo README created
- [ ] `yarn build` succeeds (no import errors)

---

## Phase 3: Extract Chat Service Layer (1.5 hours)

### Goal
Break `api/chat/route.ts` (250+ lines) into testable, reusable services

### Steps

#### 3.1 Create Directory Structure
```bash
mkdir -p apps/web/src/services/search
mkdir -p apps/web/src/services/rag
mkdir -p apps/web/src/types
```

#### 3.2 Create Type Definitions

**`apps/web/src/types/search.ts`:**
```typescript
export interface SearchMatch {
  id: number;
  node_id?: number;
  content: string;
  content_text?: string;
  metadata?: {
    number?: string;
    year?: number;
    pasal?: string;
    type?: string;
  };
}

export interface SearchResults {
  matches: SearchMatch[];
  vectorResults: SearchMatch[];
  ftsResults: SearchMatch[];
}

export interface RefinedQuery {
  original: string;
  refined: string;
}
```

**`apps/web/src/types/rag.ts`:**
```typescript
import { SearchMatch } from './search';

export interface RAGContext {
  contextText: string;
  matches: SearchMatch[];
  matchCount: number;
}

export interface RAGResponse {
  text: string;
  sources: SearchMatch[];
  error?: string;
}
```

#### 3.3 Create Search Services

**`apps/web/src/services/search/QueryRefiner.ts`:**
```typescript
import { GoogleGenAI } from '@google/genai';
import { RefinedQuery } from '@/types/search';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

export async function refineQuery(query: string): Promise<RefinedQuery> {
  const refinementPrompt = `
    Tugas: Ubah pertanyaan warga berikut menjadi kata kunci pencarian hukum yang bersih.
    - Perbaiki Saltik (typo).
    - Ambil hanya subjek, tindakan, dan objeknya.
    - Hilangkan kata tanya (berapa, apa, bagaimana).
    - Output HANYA kata kunci utama, tanpa penjelasan.

    Contoh: "denda mksimal membuang smpah di sungai" -> "denda membuang sampah sungai"
    
    Pertanyaan: "${query}"
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: refinementPrompt,
    config: { temperature: 0 }
  });

  const refined = response.text?.trim() || query;
  
  console.log(`Refined Query: ["${query}"] -> ["${refined}"]`);

  return { original: query, refined };
}
```

**`apps/web/src/services/search/EmbeddingService.ts`:**
```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: text,
    config: {
      outputDimensionality: 768,
      taskType: 'RETRIEVAL_QUERY',
    }
  });

  if (!response.embeddings?.[0]?.values) {
    throw new Error("Gagal membuat vector dari pertanyaan.");
  }

  return response.embeddings[0].values.slice(0, 768);
}
```

**`apps/web/src/services/search/HybridSearch.ts`:**
```typescript
import { createClient } from '@supabase/supabase-js';
import { SearchMatch, SearchResults } from '@/types/search';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function hybridSearch(
  queryVector: number[],
  refinedQuery: string,
  matchCount: number = 15
): Promise<SearchResults> {
  console.log("Searching database using Hybrid Strategy...");

  const [vectorResults, ftsResults] = await Promise.all([
    supabase.rpc('match_legal_chunks', {
      query_embedding: queryVector,
      match_threshold: 0.1,
      match_count: matchCount
    }),
    supabase.rpc('search_legal_chunks', {
      query_text: refinedQuery,
      match_count: matchCount
    })
  ]);

  if (vectorResults.error) throw vectorResults.error;
  if (ftsResults.error) throw ftsResults.error;

  const seenIds = new Set<number>();
  const matches: SearchMatch[] = [];

  [...(vectorResults.data || []), ...(ftsResults.data || [])].forEach((match: any) => {
    const id = match.node_id || match.id;
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      matches.push({
        ...match,
        id,
      });
    }
  });

  return {
    matches,
    vectorResults: vectorResults.data || [],
    ftsResults: ftsResults.data || [],
  };
}
```

**`apps/web/src/services/search/SourceFilter.ts`:**
```typescript
import { SearchMatch } from '@/types/search';

export function extractCitedPasals(fullAnswer: string): string[] {
  const citedPasals = Array.from(fullAnswer.matchAll(/Pasal\s*(\d+)/gi))
    .map(m => m[1]);
  return citedPasals;
}

export function filterSourcesByCitation(
  matches: SearchMatch[],
  fullAnswer: string
): SearchMatch[] {
  const citedPasals = extractCitedPasals(fullAnswer);
  
  const filteredMatches = matches.filter((m: SearchMatch) => {
    const pno = (m.metadata?.pasal || "").toString();
    return citedPasals.some(cp => 
      pno === cp || 
      pno.startsWith(cp + " ") || 
      pno.startsWith(cp + " ayat")
    );
  });

  return filteredMatches.length > 0 ? filteredMatches.slice(0, 3) : matches.slice(0, 3);
}
```

#### 3.4 Create RAG Services

**`apps/web/src/services/rag/RAGService.ts`:**
```typescript
import { SearchMatch, SearchResults } from '@/types/search';
import { RAGContext } from '@/types/rag';

export function buildRAGContext(results: SearchResults): RAGContext {
  const contextText = results.matches.length > 0
    ? results.matches.map((match: SearchMatch) => {
        const meta = match.metadata || {};
        const ref = `[Perda No ${meta.number || '?'}/${meta.year || '?'}, Pasal ${meta.pasal || '?'}]`;

        const rawContent = match.content || match.content_text || '';
        const safeContent = rawContent.length > 2000
          ? rawContent.substring(0, 2000) + "... [Teks dipotong]"
          : rawContent;

        return `${ref}: ${safeContent}`;
      }).join("\n---\n")
    : "TIDAK ADA REFERENSI HUKUM YANG RELEVAN UNTUK PERTANYAAN INI.";

  return {
    contextText,
    matches: results.matches,
    matchCount: results.matches.length,
  };
}
```

**`apps/web/src/services/rag/ResponseBuilder.ts`:**
```typescript
import { GoogleGenAI } from '@google/genai';
import { RAGResponse } from '@/types/rag';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const SYSTEM_INSTRUCTION = `
  Anda adalah Asisten AI hukum (Vector Pasal) untuk Satpol PP Kabupaten Bolaang Mongondow. 
  Anda harus bersikap profesional, tegas, dan sangat akurat.

  TUGAS & ATURAN:
  1. MENJAWAB PERTANYAAN HUKUM: Jawablah pertanyaan pengguna secara langsung dan akurat berdasarkan REFERENSI HUKUM yang diberikan.
  2. IDENTIFIKASI SUMBER: Wajib sebutkan Nomor Perda dan Pasal sebagai referensi dalam jawaban Anda.
  3. REFERENSI TIDAK DITEMUKAN: Jika pertanyaan bersifat hukum tetapi tidak ditemukan di REFERENSI HUKUM, katakan: "Mohon maaf, berdasarkan data Perda yang saya miliki saat ini, aturan tersebut tidak ditemukan."
  4. GAYA BAHASA: Gunakan Bahasa Indonesia yang formal, ringkas, dan langsung pada intinya.
  5. TEKNIS: Jika pengguna hanya menyapa (halo/hai), balas dengan sapaan singkat saja.
`;

export async function buildResponse(contextText: string, query: string) {
  console.log("Formulating answer...");

  const prompt = `
    REFERENSI HUKUM:
    ${contextText}
    
    PERTANYAAN:
    ${query}
  `;

  return ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2
    }
  });
}
```

#### 3.5 Refactor `api/chat/route.ts`

**Replace entire file with:**
```typescript
import { NextResponse } from 'next/server';
import { refineQuery } from '@/services/search/QueryRefiner';
import { generateEmbedding } from '@/services/search/EmbeddingService';
import { hybridSearch } from '@/services/search/HybridSearch';
import { filterSourcesByCitation } from '@/services/search/SourceFilter';
import { buildRAGContext } from '@/services/rag/RAGService';
import { buildResponse } from '@/services/rag/ResponseBuilder';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query } = body;

    // 1. Refine query & generate embedding
    const [refinedResult, queryVector] = await Promise.all([
      refineQuery(query),
      generateEmbedding(query),
    ]);

    // 2. Hybrid search
    const searchResults = await hybridSearch(queryVector, refinedResult.refined);

    // 3. Build RAG context
    const ragContext = buildRAGContext(searchResults);

    // 4. Generate response stream
    const stream = await buildResponse(ragContext.contextText, query);

    // 5. Stream answer + sources (NDJSON)
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let fullAnswer = "";

        try {
          for await (const chunk of stream) {
            if (chunk.text) {
              fullAnswer += chunk.text;
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', data: chunk.text }) + '\n'));
            }
          }

          // Filter sources based on citation
          const finalSources = filterSourcesByCitation(searchResults.matches, fullAnswer);

          controller.enqueue(encoder.encode(JSON.stringify({ type: 'sources', data: finalSources }) + '\n'));
        } catch (err) {
          console.error("Stream error:", err);
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', data: 'Error generating response' }) + '\n'));
        }

        controller.close();
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
      }
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan pada server." }, { status: 500 });
  }
}
```

#### 3.6 Checklist

- [ ] `src/types/search.ts` created
- [ ] `src/types/rag.ts` created
- [ ] 4 search services created
- [ ] 2 RAG services created
- [ ] `api/chat/route.ts` refactored
- [ ] `yarn build` succeeds
- [ ] Chat functionality tested

---

## Phase 4: Organize Admin Tooling (45 min)

### Goal
Document and organize admin workflows, create consistent types

#### 4.1 Create Admin Types

**`apps/web/src/types/admin.ts`:**
```typescript
export interface Work {
  id: number;
  frbr_uri: string;
  title_id: string;
  number: string;
  year: number;
  regulation_type_id: number;
  status: 'berlaku' | 'diubah' | 'dicabut' | 'tidak_berlaku';
  content_verified: boolean;
  source_url?: string;
  source_pdf_url?: string;
  slug?: string;
}

export interface DocumentNode {
  id: number;
  work_id: number;
  node_type: 'pasal' | 'ayat' | 'bab' | 'bagian' | 'preamble' | 'content';
  number?: string;
  heading?: string;
  content_text?: string;
  parent_id?: number;
  sort_order: number;
  embedding?: number[];
}

export interface Suggestion {
  id: number;
  node_id: number;
  user_name: string;
  suggested_content: string;
  reasoning: string;
  status: 'pending' | 'approved' | 'rejected';
  agent_decision?: 'accept' | 'accept_with_corrections' | 'reject';
  agent_response?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface VerificationDecision {
  decision: 'accept' | 'accept_with_corrections' | 'reject';
  confidence: number;
  reasoning: string;
  corrected_content?: string;
  additional_issues?: Array<{
    type: string;
    description: string;
    location: string;
  }>;
  parser_feedback?: string;
}
```

#### 4.2 Create Admin Documentation

**`apps/web/src/app/admin/README.md`:**

Document the three main workflows:
1. **Peraturan (Regulations) Management** — Browse, verify, parse regulations
2. **Suggestions Workflow** — User corrections → Gemini verification → apply/reject
3. **Relationships** — Cross-references and amendments

#### 4.3 Checklist

- [ ] `src/types/admin.ts` created
- [ ] `admin/README.md` comprehensive
- [ ] API endpoint documented
- [ ] Environment variables listed

---

## Phase 5: Cleanup & Docs (1 hour)

### Goal
Remove dead code, consolidate docs, clarify project scope

#### 5.1 Clean Up Dead Code
- Remove `scratch/` directory
- Remove `ocr_pipeline_log.txt`
- Add to `.gitignore` if keeping locally

#### 5.2 Consolidate Docs
- Merge `Pasal_bolmong_pro.md` into `README.md` (if duplicate)
- Keep `VECTOR_PASAL_PROJECT_KNOWLEDGE.md` (reference guide)
- Keep `VECTOR_PASAL_OPTIMIZATION_REPORT.md` (historical)

#### 5.3 Update `.env.example`
```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_API_KEY=...
NEXT_PUBLIC_SHOW_DEMO=false
```

#### 5.4 Update Root `CLAUDE.md`

Add section clarifying:
- **Bolmong-focused** scope
- **Two separate interfaces:** Web UI (primary) + MCP (optional)
- **Services architecture** explanation
- Links to detailed docs

#### 5.5 Checklist

- [ ] Dead code removed
- [ ] Docs consolidated
- [ ] `.env.example` updated
- [ ] Root `CLAUDE.md` updated
- [ ] Bolmong scope stated everywhere

---

## Verification Checklist (All Phases)

### Phase 1 ✅
- [ ] `scripts/mcp-server/` exists
- [ ] `apps/mcp-server/` does NOT exist
- [ ] No broken imports

### Phase 2 ✅
- [ ] `src/lib/demo/` exists
- [ ] `src/lib/mcp-demo/` does NOT exist
- [ ] All imports updated
- [ ] Feature flag works: `NEXT_PUBLIC_SHOW_DEMO=false` hides demo

### Phase 3 ✅
- [ ] `src/services/search/` exists (4 files)
- [ ] `src/services/rag/` exists (2 files)
- [ ] `src/types/search.ts` and `src/types/rag.ts` exist
- [ ] `api/chat/route.ts` refactored
- [ ] `yarn build` succeeds
- [ ] Chat works (test with real query)
- [ ] Sources appear correctly

### Phase 4 ✅
- [ ] `src/types/admin.ts` created
- [ ] `admin/README.md` comprehensive
- [ ] API endpoints documented

### Phase 5 ✅
- [ ] Dead code removed
- [ ] Docs consolidated
- [ ] `.env.example` updated
- [ ] Root `CLAUDE.md` updated
- [ ] All scopes clarified

---

## Final Deployment

```bash
# Commit cleanup
git add .
git commit -m "chore(cleanup): complete restructuring across 5 phases

- Phase 1: Decouple MCP server to scripts/
- Phase 2: Isolate demo code, feature-flag it
- Phase 3: Extract chat API into reusable services
- Phase 4: Document admin workflows, add types
- Phase 5: Clean up dead code, consolidate docs

Scope: Bolmong-focused (broader legal DB removed from core)"

# Deploy web app
cd apps/web
npm run build
npm run start

# Optional: Deploy MCP separately
cd scripts/mcp-server
python server.py
```

---

## Success Criteria

✅ All phases complete  
✅ No TypeScript errors  
✅ Chat works identically (user perspective)  
✅ Admin dashboard works identically  
✅ Services are testable and reusable  
✅ Scope clear: Bolmong-focused  
✅ Docs comprehensive and up-to-date  
✅ MCP deployable independently  
✅ Demo hidden by default but accessible  

---

**Status:** Ready to begin Phase 1 execution
