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

def transcribe_pdf(pdf_path: Path):
    """Transcribes a PDF using Gemini 1.5 Flash (File API)."""
    output_path = TRANSCRIPTION_DIR / f"{pdf_path.stem.lower().replace(' ', '-')}.md"
    
    if output_path.exists():
        print(f"   [SKIP] Already transcribed: {output_path.name}")
        return output_path

    print(f"   [START] Transcribing: {pdf_path.name}...")
    
    # 1. Upload PDF to Gemini File API
    try:
        # Note: For smaller PDFs (<20MB), we can send as bytes directly in contents
        # For larger ones, File API is better. We'll use bytes for simplicity here if it's small.
        file_size_mb = pdf_path.stat().st_size / (1024 * 1024)
        
        if file_size_mb < 20:
            with open(pdf_path, "rb") as f:
                pdf_bytes = f.read()
            
            prompt = (
                "Tugas: Transkripsikan dokumen hukum (Peraturan Daerah) ini ke dalam format Markdown yang bersih.\n"
                "Instruksi:\n"
                "1. Pertahankan struktur hukum (BAB, Pasal, Ayat).\n"
                "2. Gunakan heading Markdown (# untuk judul, ## untuk BAB, ### untuk Pasal).\n"
                "3. Jangan tambahkan komentar atau penjelasan, hanya teks asli.\n"
                "4. Pastikan teks akurat (perbaiki kesalahan OCR otomatis).\n"
                "5. Jika ada tabel, buat dalam format tabel Markdown.\n\n"
                "Output dalam Bahasa Indonesia."
            )

            print(f"   [Gemini] Sending {file_size_mb:.2f}MB to Gemini 1.5 Flash...")
            
            response = client.models.generate_content(
                model="gemini-1.5-flash",
                contents=[
                    types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                    prompt
                ],
                config=types.GenerateContentConfig(
                    temperature=0.0,
                    safety_settings=[
                        types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_NONE"),
                        types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_NONE"),
                        types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_NONE"),
                        types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_NONE"),
                        types.SafetySetting(category="HARM_CATEGORY_CIVIC_INTEGRITY", threshold="BLOCK_NONE"),
                    ]
                )
            )

            if response.text:
                output_path.write_text(response.text, encoding="utf-8")
                print(f"   [SUCCESS] Saved to: {output_path.name}")
                return output_path
            else:
                print(f"   [ERROR] Gemini returned empty response. Finish reason: {response.candidates[0].finish_reason if response.candidates else 'Unknown'}")
                return None

        else:
            print(f"   [TODO] File {pdf_path.name} is too large (>20MB). Needs File API implementation.")
            return None

    except Exception as e:
        print(f"   [CRITICAL] Error transcribing {pdf_path.name}: {e}")
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
