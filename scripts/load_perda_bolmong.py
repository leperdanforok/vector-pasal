"""One-off local script to process UUD 1945 (3 PDFs) and load into Supabase.

Does NOT touch crawl_jobs — completely independent of the scraper-worker.

Usage:
    python scripts/load_uud.py
    python scripts/load_uud.py --dry-run   # Parse only, don't load
    python scripts/load_uud.py --upload     # Also upload PDFs + page images to Supabase Storage
"""
import argparse
import os
import sys
import re
import time
from pathlib import Path
from google import genai
from google.genai import types

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

sys.path.insert(0, str(Path(__file__).parent))

from parser.extract_pymupdf import extract_text_pymupdf
from parser.ocr_correct import correct_ocr_errors
from parser.parse_structure import parse_structure, count_pasals
from loader.load_to_supabase import (
    init_supabase, load_work, cleanup_work_data,
    load_nodes_by_level, render_page_images,
)
PDF_DIR = Path(r"F:\Bolmong_Regulations")

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

def get_embedding(text: str):
    """Converts legal text into a 768-dim vector using Gemini Embedding 001."""
    if not text or len(text.strip()) < 5:
        return None
        
    cleaned_text = " ".join(text.split())
    
    try:
        result = client.models.embed_content(
            model="models/gemini-embedding-001",
            contents=cleaned_text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT"
            )
        )
        return result.embeddings[0].values
    except Exception as e:
        print(f"Embedding Error: {e}")
        # If you hit the 60 requests per minute limit
        if "429" in str(e):
            print("Rate limit hit, sleeping for 10s...")
            time.sleep(10)
            return get_embedding(text)
        return None

def process_pdf(pdf_path: Path, metadata: dict) -> dict | None:
    """Extract text from PDF, correct OCR errors, parse structure."""
    text, stats = extract_text_pymupdf(pdf_path)
    if not text or stats.get("error"):
        print(f"   Extract failed: {stats.get('error', 'empty text')}")
        return None

    print(f"   Extracted: {stats['page_count']} pages, {stats['char_count']} chars")

    text = correct_ocr_errors(text)
    nodes = parse_structure(text)
    pasal_count = count_pasals(nodes)
    print(f"   Parsed: {len(nodes)} top-level nodes, {pasal_count} pasals")

    return {
        **metadata,
        "nodes": nodes,
        "full_text": text,
        "source_url": "Local Upload", 
    }

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

    sb = None if args.dry_run else init_supabase()
    
    for pdf_path in pdf_files:
        # --- NEW METADATA LOGIC ---
        filename_upper = pdf_path.stem.upper()
        
        # Extract Year (Looks for 20xx)
        year_match = re.search(r'(20\d{2})', filename_upper)
        year = int(year_match.group(1)) if year_match else 2024
        
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
        print(f"    Type: {reg_type} | Year: {year} | URI: {frbr_uri}")

        metadata = {
            "type": reg_type,
            "number": "00", 
            "year": year,
            "title_id": pdf_path.stem.replace("_", " ").title(),
            "status": "berlaku",
            "slug": slug,
            "frbr_uri": frbr_uri
        }
        # --- END METADATA LOGIC ---

        # 2. Extract and Parse
        result = process_pdf(pdf_path, metadata=metadata)
        if not result or args.dry_run:
            continue

        # 3. Load into Supabase
        if sb:
            print(f"   Loading into Supabase...")
            work_id = load_work(sb, result)
            if work_id:
                cleanup_work_data(sb, work_id)
                # Returns the list of nodes
                saved_nodes = load_nodes_by_level(sb, work_id, result["nodes"])
                
                print(f"Generating Embeddings for {len(saved_nodes)} nodes...")
                
                success_count = 0
                skip_count = 0
                
                for node in saved_nodes:
                
                    # 1. Skip nodes with empty or tiny text
                    if not node.get('content') or len(node['content'].strip()) < 5:
                        skip_count += 1
                        continue
                        
                    # 2. Skip structural headers
                    if node.get('node_type') in ['root', 'bab']:
                        skip_count += 1
                        continue
                        
                    print(f"   -> Embedding node {node.get('node_id')}...", end=" ", flush=True)
                    
                    vector = get_embedding(node['content'])
                    
                    if vector:
                        sb.table("legal_chunks").insert({
                            "work_id": work_id,
                            "node_id": node['node_id'],
                            "content": node['content'],
                            "embedding": vector,
                            "metadata": {
                                "type": metadata["type"],
                                "year": metadata["year"],
                                "node_type": node['node_type']
                            }
                        }).execute()
                        print("Saved!")
                        success_count += 1
                        
                        time.sleep(0.1) 
                    else:
                        print("Vector returned empty")
                        
                print(f" Done! Saved: {success_count} | Skipped: {skip_count}")

    print("\n=== All Bolmong files processed ===")

if __name__ == "__main__":
    main()