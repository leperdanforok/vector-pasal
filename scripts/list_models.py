import os
from google import genai
from dotenv import load_dotenv
from pathlib import Path

# 1. Load .env (looking one folder up from /scripts/)
load_dotenv(Path(__file__).parent.parent / ".env")

# 2. Initialize the client
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

print("--- 📋 Available Gemini Models (2026 SDK) ---")
try:
    # We'll just print the name and display_name
    for model in client.models.list():
        print(f"ID: {model.name} | Display: {model.display_name}")
except Exception as e:
    print(f"❌ Error: {e}")