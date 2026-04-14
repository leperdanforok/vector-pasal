# Vector Pasal: Project Knowledge & Development History

This document serves as the "source of truth" and technical memory for the Vector Pasal project. It documents the architecture, the challenges faced during development, the debugging process, and the advanced features implemented.

---

## 1. Project Vision
**Vector Pasal** is a specialized AI Legal Assistant designed for the **Satpol PP (Civil Service Police Unit) of Kabupaten Bolaang Mongondow**. Its purpose is to provide instant, accurate, and reference-backed answers to legal questions derived from Regional Regulations (Perda).

### **Tech Stack**
- **Frontend:** Next.js (Vercel)
- **Backend:** Next.js API Routes + Supabase
- **Database:** PostgreSQL with `pgvector` and `pg_trgm`
- **AI Models:** 
    - `gemini-2.0-flash` / `gemini-2.5-flash` (Reasoning & Generation)
    - `text-embedding-004` / `gemini-embedding-001` (Vector Retrieval - 768 dimensions)

---

## 2. Core Features (Implemented)

### **A. Typo-Resilient Search Pipeline**
Legal search is prone to human error (e.g., *smpah* instead of *sampah*). We implemented a 3-layer safety net:
1.  **AI Search Refiner:** Every query is pre-processed by Gemini to correct typos and extract legal intent (Subject/Action/Object).
2.  **Hybrid RRF Search:** Combines semantic Vector search (meaning) with Full Text Search (keywords).
3.  **Trigram Fallback:** Uses character-level matching for words that stemming might miss.

### **B. Sanction Expansion (Penalty Linkage)**
**The Challenge:** Users ask "What is the fine for X?". In legal docs, the prohibition is in one Article (e.g., Pasal 21), but the penalty is in another (e.g., Pasal 61).
**The Solution:** The `search_legal_chunks` function now includes an expansion layer. If a specific "Work" (Regulation) matches, the system automatically fetches the top penalty/sanction clauses (`denda`, `pidana`, `sanksi`) from that same work and includes them in the AI's context.

### **C. High-Performance Ingestion**
- **Batch Processing:** Scripts like `load_perda_bolmong.py` were refactored from N+1 loops into batch operations.
- **Unified Client:** Implementation of a singleton `get_sb()` provider to handle all Supabase interactions reliably.

---

## 3. Development & Debugging History

### **Phase 1: The "Not Found" Mystery**
**Problem:** Even when keywords were correct, the system often said "No information found."
**Debug Process:**
1.  Checked `document_nodes` table; data was there (ID 25459 for trash).
2.  Tested FTS directly; it hit.
3.  Checked the SQL Function; found that it was using strict `AND` logic (`&&` for tsquery). If a user added "denda" to a "trash" query, it returned 0 because both words weren't in the same node.
**Fix:** Rewrote FTS to use the `UNION ALL` approach in Migration 059, allowing for partial matches that still rank highly.

### **Phase 2: The Missing Fines**
**Problem:** The AI found the prohibition node but told users "Information about the fine is not in the data."
**Debug Process:**
1.  Verified data contained fines (Pasal 22, 61, etc.).
2.  Realized the context window for the LLM was too narrow (only top 5 results).
3.  Realized the "fine" nodes didn't contain "trash" keywords, only Pasal numbers.
**Fix:** Implemented **Sanction Expansion** in the DB function to force-include penalty nodes from any work that had a category match.

### **Phase 3: SDK Integration**
**Problem:** Transitioning from older Google AI SDKs to the modern `@google/genai`.
**Fix:** Standardized the Chat API to use `generateContentStream` for faster user perceived response times (streaming), and ensured `outputDimensionality: 768` is passed to maintain consistency with the Postgres `vector(768)` schema.

---

## 4. Database Schema (Key Tables)

- **`works`:** Metadata for each regulation (Title, Year, Number, Region).
- **`document_nodes`:** The heart of the retrieval.
    - `content_text`: The raw text.
    - `node_type`: Categorization (`pasal`, `ayat`, `bab`, etc.).
    - `embedding`: The 768-dim vector.
    - `fts`: The searchable `tsvector`.
- **`regulation_types`:** Hierarchy mapping (Perda Kab, Perda Prov, etc.).

---

## 5. Lessons Learned & Best Practices

1.  **Stemming Matters:** Indonesian stemming (e.g., `membuang` -> `buang`) is handled well by Postgres `indonesian` config, but sometimes misses names or specific legal terms; hence the need for Trigram fallback.
2.  **Context is Everything:** For RAG, the "most similar" node isn't always enough. In law, you almost always need the "Sanctions" chapter of the same document.
3.  **Service Role for Ingestion:** Always use the `SERVICE_ROLE_KEY` for scripts to avoid RLS headaches, but use the `ANON_KEY` for public-facing searches where security is required.

---

## 6. Future Roadmap Ideas

- **Model-Based Reranking:** Use a Cross-Encoder to re-score the top 20 results before sending to the LLM.
- **Source Preview:** Implement a PDF viewer that highlights the specific page/article the AI is citing.
- **Multi-Work Synthesis:** Enhancing the "Comparison" feature where citizens can see differences between older and newer regulations on the same topic.

---
*Created by Antigravity AI - April 2026*
