"""One-off chunked OCR for Perda 1/2024 (Pajak dan Retribusi Daerah).

The full 42MB PDF triggers Gemini RECITATION on both Flash and Pro because
its content overlaps heavily with memorized national tax/retribution law.
Splitting it into ~10-page chunks reduces the per-request overlap enough
that each chunk OCRs cleanly, and we concatenate the markdown at the end.

Intermediate chunk markdown is saved per page-range so a mid-run crash
doesn't redo successful chunks. Final output goes to data/transcriptions/
with the same slug filename smart_ocr.py would have produced, so
load_perda_bolmong.py will pick it up automatically.
"""
import os
import sys
import time
from pathlib import Path

import pymupdf
from dotenv import load_dotenv
from google import genai
from google.genai import types

BASE_DIR = Path(__file__).parent.parent.parent
load_dotenv(BASE_DIR / ".env")

PDF_PATH = BASE_DIR / "data" / "raw_pdf" / "PERATURAN DAERAH NOMOR 1 TAHUN 2024 TENTANG PAJAK DAN RETRIBUSI DAERAH.pdf"
TRANSCRIPTION_DIR = BASE_DIR / "data" / "transcriptions"
CHUNK_CACHE_DIR = BASE_DIR / "data" / "transcriptions" / "_chunks_perda1_2024"
TRANSCRIPTION_DIR.mkdir(parents=True, exist_ok=True)
CHUNK_CACHE_DIR.mkdir(parents=True, exist_ok=True)

FINAL_OUTPUT = TRANSCRIPTION_DIR / "peraturan-daerah-nomor-1-tahun-2024-tentang-pajak-dan-retribusi-daerah.md"

PAGES_PER_CHUNK = 10
MODEL = "gemini-2.5-pro"
MAX_RETRIES = 3
RETRY_WAIT = [5, 15, 30]

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    print("[ERROR] GOOGLE_API_KEY not set")
    sys.exit(1)

client = genai.Client(api_key=api_key)

OCR_PROMPT = (
    "Tugas: Ekstrak isi bagian dokumen hukum (Peraturan Daerah) ini ke dalam format Markdown terstruktur untuk keperluan indexing internal.\n"
    "Ini adalah potongan dari dokumen yang lebih besar — proses hanya halaman yang diberikan.\n"
    "Instruksi:\n"
    "1. Susun ulang konten mengikuti struktur hukum (BAB, Pasal, Ayat) jika ada.\n"
    "2. Gunakan heading Markdown (## untuk BAB, ### untuk Pasal).\n"
    "3. Fokus pada akurasi struktur dan substansi; perbaiki kesalahan OCR otomatis.\n"
    "4. Jika ada tabel, sajikan dalam format tabel Markdown.\n"
    "5. Pertahankan angka Romawi pada Pasal — JANGAN dikonversi ke angka Arab.\n"
    "6. Jangan tambahkan komentar, analisis, atau ringkasan di luar isi dokumen.\n"
    "7. Jangan ulangi konten dari halaman sebelumnya — mulai dari halaman pertama yang diberikan.\n\n"
    "Output dalam Bahasa Indonesia."
)

GEN_CONFIG = types.GenerateContentConfig(
    temperature=0.4,
    safety_settings=[
        types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_NONE"),
        types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_NONE"),
        types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_NONE"),
        types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_NONE"),
        types.SafetySetting(category="HARM_CATEGORY_CIVIC_INTEGRITY", threshold="BLOCK_NONE"),
    ],
)


def split_pdf_into_chunks(pdf_path: Path, pages_per_chunk: int) -> list[tuple[int, int, Path]]:
    """Split PDF into chunk PDFs of N pages each. Returns [(start, end, path), ...]."""
    src = pymupdf.open(pdf_path)
    total = len(src)
    chunks = []
    for start in range(0, total, pages_per_chunk):
        end = min(start + pages_per_chunk, total) - 1  # inclusive
        chunk_path = CHUNK_CACHE_DIR / f"pages_{start+1:03d}-{end+1:03d}.pdf"
        if not chunk_path.exists():
            dst = pymupdf.open()
            dst.insert_pdf(src, from_page=start, to_page=end)
            dst.save(chunk_path)
            dst.close()
        chunks.append((start + 1, end + 1, chunk_path))
    src.close()
    return chunks


def ocr_chunk(chunk_path: Path, page_start: int, page_end: int) -> str | None:
    """OCR a single chunk PDF inline. Returns markdown text or None."""
    md_path = CHUNK_CACHE_DIR / f"pages_{page_start:03d}-{page_end:03d}.md"
    if md_path.exists():
        print(f"   [CACHE] Using existing chunk {md_path.name}")
        return md_path.read_text(encoding="utf-8")

    size_mb = chunk_path.stat().st_size / (1024 * 1024)
    print(f"   [OCR] Pages {page_start}-{page_end} ({size_mb:.2f}MB) → {MODEL}")

    with open(chunk_path, "rb") as f:
        pdf_bytes = f.read()
    part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")

    for attempt in range(MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=[part, OCR_PROMPT],
                config=GEN_CONFIG,
            )
            if response.text:
                md_path.write_text(response.text, encoding="utf-8")
                print(f"   [OK] Pages {page_start}-{page_end} → {len(response.text)} chars")
                return response.text

            reason = response.candidates[0].finish_reason if response.candidates else "Unknown"
            print(f"   [EMPTY] Pages {page_start}-{page_end}: {reason}")
        except Exception as e:
            err = str(e)
            transient = "503" in err or "UNAVAILABLE" in err or "429" in err
            if not transient:
                print(f"   [FATAL] Pages {page_start}-{page_end}: {e}")
                return None
            print(f"   [WARN] Transient on attempt {attempt + 1}: {e}")

        if attempt < MAX_RETRIES - 1:
            wait = RETRY_WAIT[attempt]
            print(f"   [RETRY] Waiting {wait}s...")
            time.sleep(wait)

    print(f"   [GIVE UP] Pages {page_start}-{page_end}")
    return None


def main():
    if not PDF_PATH.exists():
        print(f"[ERROR] PDF not found: {PDF_PATH}")
        sys.exit(1)

    print(f"=== Chunked OCR for {PDF_PATH.name} ===")
    print(f"Splitting into {PAGES_PER_CHUNK}-page chunks...")
    chunks = split_pdf_into_chunks(PDF_PATH, PAGES_PER_CHUNK)
    print(f"Created {len(chunks)} chunks\n")

    results = []
    failed = []
    for start, end, chunk_path in chunks:
        md = ocr_chunk(chunk_path, start, end)
        if md:
            results.append((start, end, md))
        else:
            failed.append((start, end))

    if failed:
        print(f"\n[WARN] {len(failed)} chunks failed: {failed}")
        print("Re-run the script to retry just the failed chunks (successful ones are cached).")

    if not results:
        print("[ERROR] No chunks succeeded; not writing final output.")
        sys.exit(1)

    print(f"\nMerging {len(results)} chunks into {FINAL_OUTPUT.name}...")
    header = (
        "# PERATURAN DAERAH KABUPATEN BOLAANG MONGONDOW\n"
        "# NOMOR 1 TAHUN 2024\n"
        "# TENTANG PAJAK DAN RETRIBUSI DAERAH\n\n"
        "<!-- Transcribed in chunks; merged here for indexing. -->\n\n"
    )
    body = "\n\n".join(md for _, _, md in results)
    FINAL_OUTPUT.write_text(header + body, encoding="utf-8")
    print(f"[DONE] Wrote {FINAL_OUTPUT}")


if __name__ == "__main__":
    main()
