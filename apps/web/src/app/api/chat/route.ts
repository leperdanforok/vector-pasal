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

    // 3. User Query Refinement & Embedding generation (Parallelized for P0)
    const refinementPrompt = `
    Tugas: Ubah pertanyaan warga berikut menjadi kata kunci pencarian hukum yang bersih.
    - Perbaiki Saltik (typo).
    - Ambil hanya subjek, tindakan, dan objeknya.
    - Hilangkan kata tanya (berapa, apa, bagaimana).
    - Output HANYA kata kunci utama, tanpa penjelasan.

    Contoh: "denda mksimal membuang smpah di sungai" -> "denda membuang sampah sungai"
    
    Pertanyaan: "${query}"
    `;

    const [refinementResponse, embeddingResponse] = await Promise.all([
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: refinementPrompt,
        config: { temperature: 0 }
      }),
      ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: query, // Use ORIGINAL query for embedding (fast path)
        config: {
          outputDimensionality: 768,
          taskType: 'RETRIEVAL_QUERY',
        }
      })
    ]);

    const refinedQuery = refinementResponse.text?.trim() || query;
    console.log(`Refined Query: ["${query}"] -> ["${refinedQuery}"]`);

    if (!embeddingResponse.embeddings || embeddingResponse.embeddings.length === 0 || !embeddingResponse.embeddings[0].values) {
      throw new Error("Gagal membuat vector dari pertanyaan.");
    }
    const queryVector = embeddingResponse.embeddings[0].values.slice(0, 768);

    console.log("Searching database using Hybrid Strategy...");

    // 4. Hybrid Search: Vector + FTS/Trigram
    // Using the refined query ensures FTS catches exact match despite typos in the original.
    const [vectorResults, ftsResults] = await Promise.all([
      supabase.rpc('match_legal_chunks', {
        query_embedding: queryVector,
        match_threshold: 0.1, // Very lenient — let the LLM decide relevance
        match_count: 15
      }),
      supabase.rpc('search_legal_chunks', {
        query_text: refinedQuery,
        match_count: 15
      })
    ]);

    if (vectorResults.error) throw vectorResults.error;
    if (ftsResults.error) throw ftsResults.error;

    // Merge and deduplicate by node ID
    const seenIds = new Set<number>();
    const matches: any[] = [];

    // Prioritize vector results but supplement with FTS/Trigram results
    [...(vectorResults.data || []), ...(ftsResults.data || [])].forEach((match: any) => {
      const id = match.node_id || match.id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        matches.push({
          ...match,
          id, // unify ID field
        });
      }
    });


    // 5. Build the legal context for the AI (Token Trimmed)
    const contextText = matches.length > 0 
      ? matches.map((match: any) => {
          const meta = match.metadata || {};
          const ref = `[Perda No ${meta.number || '?'}/${meta.year || '?'}, Pasal ${meta.pasal || '?'}]`;

          const rawContent = match.content || match.content_text || '';
          const safeContent = rawContent.length > 2000
            ? rawContent.substring(0, 2000) + "... [Teks dipotong]"
            : rawContent;

          return `${ref}: ${safeContent}`;
        }).join("\n---\n")
      : "TIDAK ADA REFERENSI HUKUM YANG RELEVAN UNTUK PERTANYAAN INI.";

    console.log("Formulating answer...");

    // 6. Ask Gemini 2.5 Flash to answer based ONLY on the context
    const systemInstruction = `
    Anda adalah Asisten AI hukum (Vector Pasal) untuk Satpol PP Kabupaten Bolaang Mongondow. 
    Anda harus bersikap profesional, tegas, dan sangat akurat.

    TUGAS & ATURAN:
    1. MENJAWAB PERTANYAAN HUKUM: Jawablah pertanyaan pengguna secara langsung dan akurat berdasarkan REFERENSI HUKUM yang diberikan.
    2. IDENTIFIKASI SUMBER: Wajib sebutkan Nomor Perda dan Pasal sebagai referensi dalam jawaban Anda.
    3. REFERENSI TIDAK DITEMUKAN: Jika pertanyaan bersifat hukum tetapi tidak ditemukan di REFERENSI HUKUM, katakan: "Mohon maaf, berdasarkan data Perda yang saya miliki saat ini, aturan tersebut tidak ditemukan."
    4. GAYA BAHASA: Gunakan Bahasa Indonesia yang formal, ringkas, dan langsung pada intinya. Jangan menambahkan sapaan basa-basi kecuali jika pengguna memang hanya menyapa.
    5. TEKNIS: Jika pengguna hanya menyapa (halo/hai), balas dengan sapaan singkat saja dan tanyakan apa yang bisa dibantu secara ringkas.
    `;

    const prompt = `
    REFERENSI HUKUM:
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
        temperature: 0.2
      }
    });

    // 7. Stream the answer AND the sources back to the frontend using NDJSON
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let fullAnswer = "";

        try {
          // Stream the text first
          for await (const chunk of stream) {
            if (chunk.text) {
              fullAnswer += chunk.text;
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', data: chunk.text }) + '\n'));
            }
          }

          // 8. Dynamic Source Filtering (Post-Generation)
          // Look for mentioned Pasals in the text (e.g., "Pasal 13", "Pasal 37")
          const citedPasals = Array.from(fullAnswer.matchAll(/Pasal\s*(\d+)/gi)).map(m => m[1]);
          
          let filteredMatches = matches.filter((m: any) => {
            const pno = (m.metadata?.pasal || "").toString();
            // Check if the pasal number from metadata appears in the cited list
            return citedPasals.some(cp => pno === cp || pno.startsWith(cp + " ") || pno.startsWith(cp + " ayat"));
          });

          // Use filtered sources if found, otherwise fallback to top 3 relevant results
          const finalSources = filteredMatches.length > 0 
            ? filteredMatches.slice(0, 3) 
            : matches.slice(0, 3);

          // Send sources as the final chunk
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'sources', data: finalSources }) + '\n'));

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