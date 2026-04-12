import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai'; // <-- NEW SDK IMPORT

// 1. Initialize Supabase (Using the Service Role Key for backend access)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Initialize Gemini (New SDK Syntax)
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query } = body;

    if (!query) {
      return NextResponse.json({ error: "Pertanyaan tidak boleh kosong." }, { status: 400 });
    }

    console.log("Thinking (embedding question)...");

    // 3. Convert the question into a 3072-dim vector (New SDK Syntax)
    const embeddingResponse = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: query,
    });
    if (!embeddingResponse.embeddings || embeddingResponse.embeddings.length === 0) {
      throw new Error("Gagal membuat vector dari pertanyaan.");
    }
    const queryVector = embeddingResponse.embeddings[0].values;

    console.log("Searching database...");

    // 4. Search Supabase using our custom SQL function (Token & Cost Optimized)
    const { data: matches, error } = await supabase.rpc('match_legal_chunks', {
      query_embedding: queryVector,
      match_threshold: 0.5, // Remember to set 0.73 for tighter threshold guarantees only highly relevant matches
      match_count: 5         // Reduced to 3 to strictly minimize LLM input costs
    });

    if (error) throw error;

    if (!matches || matches.length === 0) {
      const emptyRes = JSON.stringify({ type: 'text', data: "Menurut data Perda saat ini, aturan tersebut tidak ditemukan." }) + '\n';
      return new Response(emptyRes, {
        headers: { 'Content-Type': 'application/x-ndjson' }
      });
    }

    // 5. Build the legal context for the AI (Token Trimmed)
    const contextText = matches.map((match: any) => {
      // Trim extremely long chunks to prevent massive token waste, preserving context
      const safeContent = match.content.length > 1500
        ? match.content.substring(0, 1500) + "... [Teks dipotong untuk efisiensi]"
        : match.content;

      return `[Referensi Hukum]: ${safeContent}`;
    }).join("\n---\n");

    console.log("Formulating answer...");

    // 6. Ask Gemini 2.5 Flash to answer based ONLY on the context
    const systemInstruction = `
    Anda adalah Asisten AI untuk Satpol PP Kabupaten Bolaang Mongondow.
    Tugas Anda adalah menjawab pertanyaan warga atau petugas HANYA berdasarkan teks hukum yang diberikan.
    Jika jawabannya tidak ada di teks yang diberikan, katakan: "Menurut data Perda saat ini, aturan tersebut tidak ditemukan."
    Jangan mengarang jawaban (no hallucinations). Jawab dengan ramah, tegas, dan mudah dimengerti.
    `;

    const prompt = `
    TEKS HUKUM (REFERENSI):
    ${contextText}
    
    PERTANYAAN:
    ${query}
    `;

    // New SDK Syntax for Generating Content Stream
    const stream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.1
      }
    });

    // 7. Stream the answer AND the sources back to the frontend using NDJSON
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        // Send sources as the first chunk
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'sources', data: matches }) + '\n'));

        try {
          for await (const chunk of stream) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', data: chunk.text }) + '\n'));
            }
          }
        } catch (err) {
          console.error("Stream error:", err);
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', data: 'Error generating response' }) + '\n'));
        }

        controller.close();
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
      }
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan pada server." }, { status: 500 });
  }
}