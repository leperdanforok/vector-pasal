import os
import sys
import time
import re
from pathlib import Path
from google import genai
from google.genai import types
import pymupdf
from dotenv import load_dotenv

# Load environment variables from project root
load_dotenv(Path(__file__).parent.parent.parent / ".env")

# 1. Setup Directories
BASE_DIR = Path(__file__).parent.parent.parent
RAW_PDF_DIR = BASE_DIR / "data" / "raw_pdf"
TRANSCRIPTION_DIR = BASE_DIR / "data" / "transcriptions"
TRANSCRIPTION_DIR.mkdir(parents=True, exist_ok=True)

# 2. Initialize Gemini Client
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    print("[ERROR] GOOGLE_API_KEY not found in .env")
    sys.exit(1)

client = genai.Client(api_key=api_key)

# Shared OCR prompt and generation config — used by both inline and File API paths.
OCR_PROMPT = (
    "Tugas: Ekstrak isi dokumen hukum (Peraturan Daerah) ini ke dalam format Markdown terstruktur untuk keperluan indexing internal.\n"
    "Instruksi:\n"
    "1. Susun ulang konten mengikuti struktur hukum (BAB, Pasal, Ayat).\n"
    "2. Gunakan heading Markdown (# untuk judul, ## untuk BAB, ### untuk Pasal).\n"
    "3. Fokus pada akurasi struktur dan substansi; perbaiki kesalahan OCR otomatis.\n"
    "4. Jika ada tabel, sajikan dalam format tabel Markdown.\n"
    "5. Pertahankan angka Romawi pada Pasal (contoh: Pasal I, Pasal II) — JANGAN dikonversi ke angka Arab. Ini penting untuk Perda perubahan.\n"
    "6. Jangan tambahkan komentar, analisis, atau ringkasan di luar isi dokumen.\n\n"
    "Output dalam Bahasa Indonesia."
)

# Recitation/transient retry config — Gemini sometimes refuses public legal text
# under RECITATION; a small temperature plus retries reliably gets through.
OCR_MAX_RETRIES = 3
OCR_RETRY_WAIT = [5, 15, 30]  # seconds between attempts

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

MODEL = "gemini-2.5-pro"
INLINE_LIMIT_MB = 20            # Gemini inline-bytes limit
FILE_API_POLL_INTERVAL = 3      # seconds between state polls
FILE_API_TIMEOUT = 300          # max seconds to wait for ACTIVE state


def is_scanned_pdf(path):
    """Check if PDF needs OCR by checking text density in the first few pages."""
    try:
        with pymupdf.open(path) as doc:
            total_text = ""
            for i in range(min(3, len(doc))):
                total_text += doc[i].get_text()
            
            # If less than 50 words across 3 pages, it's likely scanned
            if len(total_text.split()) < 50:
                return True
        return False
    except Exception:
        return True

def _generate(pdf_part):
    """Run the OCR generation against either an inline Part or an uploaded File handle."""
    return client.models.generate_content(
        model=MODEL,
        contents=[pdf_part, OCR_PROMPT],
        config=GEN_CONFIG,
    )


def _transcribe_inline(pdf_path: Path, file_size_mb: float):
    print(f"   [Gemini] Sending {file_size_mb:.2f}MB inline to {MODEL}...")
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()
    return _generate(types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"))


def _transcribe_via_file_api(pdf_path: Path, file_size_mb: float):
    print(f"   [Gemini] Uploading {file_size_mb:.2f}MB via File API...")
    uploaded = client.files.upload(
        file=str(pdf_path),
        config=types.UploadFileConfig(
            mime_type="application/pdf",
            display_name=pdf_path.name,
        ),
    )
    try:
        # PDFs typically process in seconds, but large scans can take longer. Poll until ACTIVE.
        deadline = time.time() + FILE_API_TIMEOUT
        while uploaded.state.name == "PROCESSING":
            if time.time() > deadline:
                raise TimeoutError(
                    f"File API processing exceeded {FILE_API_TIMEOUT}s for {pdf_path.name}"
                )
            time.sleep(FILE_API_POLL_INTERVAL)
            uploaded = client.files.get(name=uploaded.name)

        if uploaded.state.name != "ACTIVE":
            raise RuntimeError(f"File API returned non-ACTIVE state: {uploaded.state.name}")

        print(f"   [Gemini] File ACTIVE ({uploaded.name}), sending to {MODEL}...")
        return _generate(uploaded)
    finally:
        # Clean up to stay under the 50-file-per-project quota.
        try:
            client.files.delete(name=uploaded.name)
        except Exception as e:
            print(f"   [WARN] Failed to delete uploaded file {uploaded.name}: {e}")


def transcribe_pdf(pdf_path: Path):
    """Transcribes a scanned PDF to Markdown via Gemini.

    Files under ``INLINE_LIMIT_MB`` use the inline-bytes path (one request).
    Files at or above the limit use the File API (upload → poll → generate → delete).
    """
    output_path = TRANSCRIPTION_DIR / f"{pdf_path.stem.lower().replace(' ', '-')}.md"

    if output_path.exists():
        print(f"   [SKIP] Already transcribed: {output_path.name}")
        return output_path

    print(f"   [START] Transcribing: {pdf_path.name}...")
    file_size_mb = pdf_path.stat().st_size / (1024 * 1024)

    for attempt in range(OCR_MAX_RETRIES):
        try:
            if file_size_mb < INLINE_LIMIT_MB:
                response = _transcribe_inline(pdf_path, file_size_mb)
            else:
                response = _transcribe_via_file_api(pdf_path, file_size_mb)

            if response.text:
                output_path.write_text(response.text, encoding="utf-8")
                print(f"   [SUCCESS] Saved to: {output_path.name}")
                return output_path

            reason = response.candidates[0].finish_reason if response.candidates else "Unknown"
            print(f"   [ERROR] Gemini returned empty response. Finish reason: {reason}")

        except Exception as e:
            err = str(e)
            transient = "503" in err or "UNAVAILABLE" in err or "429" in err
            if not transient:
                print(f"   [CRITICAL] Error transcribing {pdf_path.name}: {e}")
                return None
            print(f"   [WARN] Transient error on attempt {attempt + 1}: {e}")

        if attempt < OCR_MAX_RETRIES - 1:
            wait = OCR_RETRY_WAIT[attempt]
            print(f"   [RETRY] Waiting {wait}s before attempt {attempt + 2}...")
            time.sleep(wait)

    print(f"   [GIVE UP] All {OCR_MAX_RETRIES} attempts failed for {pdf_path.name}")
    return None

def main():
    pdf_files = list(RAW_PDF_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"No PDFs found in {RAW_PDF_DIR}")
        return

    print(f"=== Starting Smart OCR for {len(pdf_files)} files ===\n")
    
    for pdf in pdf_files:
        if is_scanned_pdf(pdf):
            transcribe_pdf(pdf)
        else:
            print(f"   [SKIP] {pdf.name} is text-based, no OCR needed.")

if __name__ == "__main__":
    main()
