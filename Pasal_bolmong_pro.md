<p align="center">
  <img src="logo/pasal-bolmong-logo.svg" alt="vectorpasal.vercel.app Bolmong" height="64" />
</p>

<h3 align="center">vector-pasal: Bolmong Edition</h3>
<p align="center"><b>"NotebookLM for Local Regulations"</b></p>

<p align="center">
  A Semantic RAG Platform and PWA designed for <b>Satpol PP Bolaang Mongondow</b> to provide instant, grounded legal answers in the field.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Region-Bolaang_Mongondow-red?style=flat" alt="Region: Bolmong" />
  <img src="https://img.shields.io/badge/Stack-Next.js_16_|_Supabase-black?style=flat" />
  <img src="https://img.shields.io/badge/AI-Gemini_1.5_Flash-blue?style=flat" />
  <img src="https://img.shields.io/badge/PWA-Ready-orange?style=flat" />
</p>

---

## 🏛️ Project Vision
280 million Indonesians, including those in **Bolaang Mongondow**, often struggle to navigate dense legal PDFs. vector-pasal transforms static regional regulations (Perda) into a dynamic "Notebook" experience. Using Semantic RAG (Retrieval-Augmented Generation), Satpol PP officers can ask natural language questions and receive answers cited directly from specific articles (Pasal), preventing AI hallucinations.

## 🛠️ Tech Stack (Free-Tier Optimized)
| Layer | Technology | Role |
|-------|------------|------|
| **Frontend** | Next.js 16 (App Router) | High-performance UI with Turbopack. |
| **Database** | Supabase + `pgvector` | Stores 40,000+ regulations and vector embeddings. |
| **Embeddings**| Gemini `text-embedding-004` | Converts legal text into searchable mathematical vectors. |
| **LLM Engine**| Gemini 1.5 Flash | Synthesizes grounded answers with exact citations. |
| **Mobile** | PWA (Serwist) | Enables "Add to Home Screen" and offline field access. |

## 🚀 Core Features
* **3-Layer Search**: Combines identity fast-path (regex), metadata search (FTS), and deep content search with Indonesian stemming.
* **Semantic RAG**: Understands intent (e.g., "Where can vendors trade?") rather than just keyword matching.
* **Append-Only Audit Trail**: Every legal mutation is logged via `apply_revision()` for 100% data integrity.
* **Bilingual UI**: Full support for Indonesian (default) and English interfaces.

## 📂 System Architecture


1. **Extraction**: `load_perda_bolmong.py` uses Gemini Vision to parse 100+ page PDFs into structured JSON.
2. **Indexing**: Text is broken into chunks and stored in Supabase with hierarchical `LTREE` paths.
3. **Retrieval**: User queries trigger a vector similarity search in `pgvector`.
4. **Response**: Gemini 1.5 Flash generates a response using only the retrieved context, citing specific **Pasal** and **Ayat**.

## 📈 Roadmap (2026-2028)
- [ ] **Vectorization**: Generate embeddings for all existing Bolmong legal chunks.
- [ ] **PWA Deployment**: Configure `manifest.ts` for offline-first mobile access.
- [ ] **WhatsApp Integration**: Allow officers to query laws via a dedicated WA Bot.
- [ ] **LPDP Portfolio**: Finalize as a "Data Science for Public Policy" case study for 2028 scholarship application.

---
**Author:** Viddie Pilat  
**Organization:** Satpol PP Bolaang Mongondow  
**License:** AGPL-3.0