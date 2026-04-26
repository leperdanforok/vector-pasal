"""Batch-load Bolmong regional regulations (Perda) into Supabase.

Scans a folder of PDFs, parses each into structured document nodes,
generates Gemini embeddings in batches, and loads everything into
Supabase ``document_nodes`` with FTS auto-generated.

Embeddings are stored in a ``embedding`` column on ``document_nodes``
(added by migration 056). If the column doesn't exist yet, embedding
storage is silently skipped — FTS search still works.

Usage:
    python scripts/load_perda_bolmong.py
    python scripts/load_perda_bolmong.py --dry-run   # Parse only, don't load
"""
import argparse
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from google import genai
from google.genai import types

from loader.load_to_supabase import (
    get_sb, process_pdf, load_work, cleanup_work_data, load_nodes_by_level,
)

BASE_DIR = Path(__file__).parent.parent
PDF_DIR = BASE_DIR / "data" / "raw_pdf"

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

# ── Batch embedding ─────────────────────────────────────────────────────────

EMBEDDING_BATCH_SIZE = 100      # Gemini supports up to 100 texts per call
EMBEDDING_MAX_RETRIES = 3
EMBEDDING_RETRY_WAIT = [10, 30, 60]  # seconds


def get_embeddings_batch(texts: list[str]) -> list[list[float] | None]:
    """Generate embeddings for a batch of texts using Gemini Embedding API.

    Returns a list of vectors (one per input text). Individual texts that
    fail get ``None`` in their slot instead of crashing the whole batch.
    Rate-limit retries are capped at EMBEDDING_MAX_RETRIES to prevent
    infinite recursion.
    """
    if not texts:
        return []

    for attempt in range(EMBEDDING_MAX_RETRIES):
        try:
            result = client.models.embed_content(
                model="models/gemini-embedding-001",
                contents=texts,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    output_dimensionality=768
                ),
            )
            return [e.values[:768] for e in result.embeddings]
        except Exception as e:
            if "429" in str(e) and attempt < EMBEDDING_MAX_RETRIES - 1:
                wait = EMBEDDING_RETRY_WAIT[attempt]
                print(f"   Rate limit hit, waiting {wait}s (attempt {attempt + 1})...")
                time.sleep(wait)
            else:
                print(f"   Embedding batch error: {e}")
                return [None] * len(texts)

    return [None] * len(texts)


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Process Bolmong Regulations")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    # 1. Find all PDFs in your folder automatically
    pdf_files = list(PDF_DIR.glob("*.pdf"))
    print(f"=== Found {len(pdf_files)} PDFs in {PDF_DIR} ===\n")

    if not pdf_files:
        print("No PDFs found! Check your folder path.")
        return

    sb = None if args.dry_run else get_sb()

    for pdf_path in pdf_files:
        # --- Metadata from filename ---
        filename_upper = pdf_path.stem.upper()

        # Extract Year (Looks for 20xx)
        year_match = re.search(r'(20\d{2})', filename_upper)
        year = int(year_match.group(1)) if year_match else 2024

        # Extract Number (Looks for No. 8, No 8, or Nomor 8)
        num_match = re.search(r'(?:NO\.?|NOMOR)\s*(\d+)', filename_upper)
        reg_num = num_match.group(1) if num_match else "00"

        # Map Regulation Type
        reg_type = "PERDA_KAB"
        if "PROV" in filename_upper:
            reg_type = "PERDA_PROV"
        elif "PERBUP" in filename_upper or "BUPATI" in filename_upper:
            reg_type = "PERDA_KAB"

        # Generate Slug & FRBR URI
        slug = pdf_path.stem.lower().replace(" ", "-").replace("_", "-")
        frbr_uri = f"/akn/id/act/local/bolmong/{slug}"

        print(f"--- Processing: {pdf_path.name} ---")
        print(f"    Type: {reg_type} | No: {reg_num} | Year: {year} | URI: {frbr_uri}")

        metadata = {
            "type": reg_type,
            "number": reg_num,
            "year": year,
            "title_id": pdf_path.stem.replace("_", " ").title(),
            "status": "berlaku",
            "slug": slug,
            "frbr_uri": frbr_uri,
            "source_url": "Local Upload",
        }

        # 2. Extract and Parse (uses shared process_pdf)
        result = process_pdf(pdf_path, metadata=metadata)
        if not result or args.dry_run:
            continue

        # 3. Load into Supabase (document_nodes with auto-generated FTS)
        if sb:
            print(f"   Loading into Supabase...")
            work_id = load_work(sb, result)
            if not work_id:
                print(f"   FAILED to create work for {pdf_path.name}")
                continue

            cleanup_work_data(sb, work_id)
            saved_nodes = load_nodes_by_level(sb, work_id, result["nodes"])
            print(f"   Inserted {len(saved_nodes)} nodes into document_nodes (FTS auto-generated)")

            # 4. Generate embeddings in batches and store them
            #    Filter to content-bearing nodes with enough text
            embeddable = [
                n for n in saved_nodes
                if n.get("content")
                and len(n["content"].strip()) >= 20
                and n.get("node_type") not in ("root", "bab")
            ]

            if embeddable:
                print(f"   Generating embeddings for {len(embeddable)} nodes in batches of {EMBEDDING_BATCH_SIZE}...")

                success_count = 0
                skip_count = len(saved_nodes) - len(embeddable)

                # Process in batches
                for batch_start in range(0, len(embeddable), EMBEDDING_BATCH_SIZE):
                    batch = embeddable[batch_start:batch_start + EMBEDDING_BATCH_SIZE]

                    # Contextualize: prepend law title + node identity for better retrieval
                    # Example: "[Perda No 3 2023] Pasal 12 Ayat (1): Peternak harus..."
                    law_title = metadata['title_id']
                    updates = []
                    texts = []
                    
                    for n in batch:
                        node_identity = f"{n['node_type'].capitalize()} {n['number']}"
                        full_context_text = f"[{law_title}] {node_identity}: {n['content']}"
                        texts.append(full_context_text)

                    vectors = get_embeddings_batch(texts)

                    # Batch-update document_nodes with embeddings
                    updates = []
                    for node, vector in zip(batch, vectors):
                        if vector is not None:
                            updates.append({
                                "node_id": node["node_id"],
                                "embedding": vector,
                            })

                    if updates:
                        # Try batch update via individual calls (Supabase SDK
                        # doesn't support batch UPDATE by different IDs in one call)
                        for upd in updates:
                            try:
                                sb.table("document_nodes").update(
                                    {"embedding": upd["embedding"]}
                                ).eq("id", upd["node_id"]).execute()
                                success_count += 1
                            except Exception as e:
                                # Column might not exist yet — skip silently
                                if "embedding" in str(e).lower() and "column" in str(e).lower():
                                    print(f"   Note: 'embedding' column not found — skipping vector storage.")
                                    print(f"         FTS search still works. Run migration 056 to enable embeddings.")
                                    break
                                print(f"   Embedding update error for node {upd['node_id']}: {e}")

                    batch_end = min(batch_start + EMBEDDING_BATCH_SIZE, len(embeddable))
                    print(f"   -> Batch {batch_start // EMBEDDING_BATCH_SIZE + 1}: "
                          f"embedded {batch_end}/{len(embeddable)}")

                    # Small delay between batches to stay well under rate limits
                    if batch_start + EMBEDDING_BATCH_SIZE < len(embeddable):
                        time.sleep(1)

                print(f"   Done! Embedded: {success_count} | Skipped: {skip_count}")

    print("\n=== All Bolmong files processed ===")

if __name__ == "__main__":
    main()