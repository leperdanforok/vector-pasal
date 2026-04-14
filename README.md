# Vector Pasal: Bolmong Edition 🏛️

**The AI Legal Assistant for Satpol PP Kabupaten Bolaang Mongondow**

Vector Pasal (VP) is a specialized AI platform designed to empower Satpol PP officers in Bolaang Mongondow with instant, accurate, and reference-backed legal information. It transforms dense Regional Regulations (Perda) into a dynamic, searchable "Notebook" experience using state-of-the-art AI.

[![Region: Bolmong](https://img.shields.io/badge/Region-Bolaang_Mongondow-red?style=flat)](#)
[![Stack: Next.js 16 | Supabase](https://img.shields.io/badge/Stack-Next.js_16_|_Supabase-black?style=flat)](#)
[![AI: Gemini 1.5 Flash](https://img.shields.io/badge/AI-Gemini_1.5_Flash-blue?style=flat)](#)
[![PWA: Ready](https://img.shields.io/badge/PWA-Ready-orange?style=flat)](#)

---

## 🌟 Overview

Navigating legal documents can be complex and time-consuming. Vector Pasal solves this by using **Retrieval-Augmented Generation (RAG)** to provide answers that are directly cited from official regulations, preventing AI "hallucinations" and ensuring every response has a solid legal basis.

### Key Features
- **Grounded AI Chatbot**: Responses are strictly based on official Perda documents.
- **Semantic Search**: Understands the *intent* behind questions (e.g., "Where can vendors trade?") rather than just matching keywords.
- **Automatic Penalty Linkage**: When a prohibition is found, the system automatically fetches related sanctions and fines from other parts of the document.
- **Progressive Web App (PWA)**: Installable on Android and iOS for instant access during field operations.
- **Reference Citations**: Every answer includes the specific Article (Pasal) and Paragraph (Ayat) for legal verification.
- **Typo-Resilient**: Advanced search pipeline that corrects typos and handles Indonesian stemming.

---

## 🛠️ Technical Stack

- **Frontend**: Next.js 16 (App Router) with Tailwind CSS & Shadcn UI.
- **Backend**: Next.js API Routes & Supabase.
- **Database**: PostgreSQL with `pgvector` for semantic search and `pg_trgm` for fuzzy matching.
- **AI Models**:
  - **Gemini 1.5 Flash**: Reasoning and grounded answer generation.
  - **text-embedding-004**: Converting legal text into 768-dimensional vectors.
- **Mobile**: Serwist for PWA capabilities.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Python 3.10+](https://www.python.org/)
- [Supabase Account](https://supabase.com/)
- [Google AI (Gemini) API Key](https://aistudio.google.com/)

### 1. Database Setup (Supabase)
1. Create a new project in Supabase.
2. Enable the `vector` extension in your database.
3. Apply the migrations located in `packages/supabase/migrations/` to set up the schema and RPC functions.

### 2. Web Application Setup
1. Navigate to the web app directory:
   ```bash
   cd apps/web
   ```
2. Copy the example environment file and fill in your credentials:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

### 3. Data Ingestion (Python Scripts)
To load legal documents into your database:
1. Navigate to the scripts directory:
   ```bash
   cd scripts
   ```
2. Create a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. Configure the environment:
   ```bash
   cp .env.example .env
   ```
4. Run the ingestion scripts (e.g., for Bolmong regulations):
   ```bash
   python load_perda_bolmong.py
   ```

---

## 🧠 Advanced Search Architecture

Vector Pasal uses a 3-layer safety net to ensure accuracy:
1. **AI Search Refiner**: Gemini-Flash pre-processes queries to correct typos and extract legal intent.
2. **Hybrid RRF Search**: Combines semantic vector search (meaning) with Full Text Search (keywords).
3. **Trigram Fallback**: Uses character-level matching for words that stemming might miss.

**Sanction Expansion**: A unique feature where the system automatically links prohibitions to their respective penalties, even if they are located in different chapters of the legal document.

---

## 📂 Project Structure
- `apps/web`: The Next.js 16 frontend and API.
- `packages/supabase`: Database migrations and schema definitions.
- `scripts/`: Python tools for PDF parsing, embedding generation, and data loading.

---

## 📝 License
This project is licensed under the AGPL-3.0 License.

**Developed by [Viddie Pilat](https://github.com/viddie)**
*Built upon the foundation of [pasal.id](https://pasal.id)*
