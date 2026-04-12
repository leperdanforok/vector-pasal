import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types
from supabase import create_client, Client

# 1. Setup
load_dotenv(Path(__file__).parent.parent / ".env")

# Init Supabase — read-only operations only, anon key is sufficient
sb_url = os.getenv("SUPABASE_URL")
sb_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
sb: Client = create_client(sb_url, sb_key)

# Init Gemini
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

def get_query_embedding(query: str):
    """Turns the user's question into a 3072-dim vector."""
    print("🧠 Thinking (embedding question)...")
    result = client.models.embed_content(
        model="models/gemini-embedding-001",
        contents=query,
        config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY") # Note: QUERY instead of DOCUMENT
    )
    return result.embeddings[0].values

def search_regulations(query: str):
    """Searches Supabase for the most relevant legal chunks."""
    query_vector = get_query_embedding(query)
    
    print("🔍 Searching database...")
    # Call the SQL function we just made!
    response = sb.rpc(
        "match_legal_chunks",
        {
            "query_embedding": query_vector,
            "match_threshold": 0.5, # 0.5 means "somewhat related", 0.8 means "very strict match"
            "match_count": 5        # Bring back the top 5 chunks
        }
    ).execute()
    
    return response.data

def ask_satpol_bot(query: str):
    """The main RAG function."""
    # 1. Get relevant chunks from DB
    matches = search_regulations(query)
    
    if not matches:
        return "Maaf, saya tidak menemukan aturan terkait pertanyaan ini di database."
    
    # 2. Build the context string
    context_text = "\n\n".join([f"[Pasal/Bagian]: {match['content']}" for match in matches])
    
    # 3. Create the strict prompt for Gemini
    system_instruction = """
    Anda adalah Asisten AI untuk Satpol PP Kabupaten Bolaang Mongondow.
    Tugas Anda adalah menjawab pertanyaan warga atau petugas HANYA berdasarkan teks hukum yang diberikan.
    Jika jawabannya tidak ada di teks yang diberikan, katakan: "Menurut data Perda saat ini, aturan tersebut tidak ditemukan."
    Jangan mengarang jawaban (no hallucinations). Jawab dengan ramah, tegas, dan mudah dimengerti.
    """
    
    prompt = f"""
    TEKS HUKUM (REFERENSI):
    {context_text}
    
    PERTANYAAN:
    {query}
    """
    
    print("🤖 Formulating answer...\n")
    # 4. Generate answer using Gemini 2.5 Flash
    response = client.models.generate_content(
        model="models/gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.1 # Keep it low so it doesn't get "creative" with the law
        )
    )
    
    return response.text

# --- Interactive Terminal ---
if __name__ == "__main__":
    print("=== 🏛️ Satpol PP Bolmong AI Test ===")
    print("Ketik 'exit' untuk keluar.\n")
    
    while True:
        user_input = input("👤 Anda: ")
        if user_input.lower() in ['exit', 'quit']:
            break
            
        answer = ask_satpol_bot(user_input)
        print(f"\n🤖 vector-pasal Bot:\n{answer}\n")
        print("-" * 50)