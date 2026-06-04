import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai'; // <-- NEW SDK IMPORT
import { SYSTEM_INSTRUCTION, buildRefinementPrompt, buildUserPrompt } from '@/lib/prompt';

// 1. Initialize Supabase (Using the Service Role Key for backend access)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Initialize Gemini (New SDK Syntax)
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Run on the Node runtime and allow long streamed answers so a deployed instance
// is not cut off at the default (short) serverless limit mid-generation.
export const runtime = 'nodejs';
export const maxDuration = 60;

type ChatHistoryMessage = { role: 'user' | 'ai'; content: string };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query, history } = body as { query: string; history?: ChatHistoryMessage[] };

    // 3. User Query Refinement & Embedding generation (Parallelized for P0)
    const refinementPrompt = buildRefinementPrompt(query);

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

    // 6. Ask Gemini 2.5 Flash to answer based ONLY on the context.
    // Build a multi-turn `contents` array so the model has real conversation
    // context: it answers follow-ups and only greets/introduces itself once
    // (a fresh, history-less request is what made it re-greet every turn).
    const systemInstruction = SYSTEM_INSTRUCTION;

    const historyContents = (Array.isArray(history) ? history : [])
      .filter((m) => m && typeof m.content === 'string' && m.content.trim())
      .slice(-8) // bound tokens — keep only the most recent turns
      .map((m) => ({
        role: m.role === 'ai' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // Only the final user turn carries the retrieved legal context.
    const contents = [
      ...historyContents,
      { role: 'user', parts: [{ text: buildUserPrompt(contextText, query) }] },
    ];

    // 7. Stream the answer AND the sources back to the frontend using NDJSON
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

        // One streamed generation attempt. Returns the accumulated text plus any
        // non-STOP finish reason (RECITATION/SAFETY/etc.) so the caller can react.
        const runOnce = async (temperature: number) => {
          let answer = '';
          let blockReason = '';
          const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents,
            config: { systemInstruction, temperature },
          });
          for await (const chunk of stream) {
            const finishReason = chunk.candidates?.[0]?.finishReason;
            if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
              blockReason = finishReason;
            }
            if (chunk.promptFeedback?.blockReason) {
              blockReason = chunk.promptFeedback.blockReason;
            }
            if (chunk.text) {
              answer += chunk.text;
              send({ type: 'text', data: chunk.text });
            }
          }
          return { answer, blockReason };
        };

        try {
          let { answer: fullAnswer, blockReason } = await runOnce(0.2);

          // RECITATION/empty completions usually drop the whole candidate (no text
          // streamed yet). Retry once at a slightly higher temperature — the
          // project's documented mitigation — but only when nothing was streamed,
          // so the user never sees duplicated text.
          if (!fullAnswer.trim() && blockReason) {
            console.error(`Gemini produced no text (finishReason=${blockReason}); retrying once at temp 0.4`);
            ({ answer: fullAnswer, blockReason } = await runOnce(0.4));
          }

          // Still nothing → surface a specific, honest message instead of a silent
          // "disconnect".
          if (!fullAnswer.trim()) {
            console.error(`Empty Gemini response after retry. finishReason=${blockReason || 'unknown'}`);
            let msg: string;
            if (blockReason === 'RECITATION') {
              msg = 'Maaf, jawaban tidak dapat ditampilkan karena pembatasan kutipan teks (RECITATION). Silakan ubah atau persempit pertanyaan Anda.';
            } else if (blockReason === 'SAFETY') {
              msg = 'Maaf, jawaban diblokir oleh filter keamanan. Silakan ubah pertanyaan Anda.';
            } else {
              msg = 'Maaf, sistem tidak dapat menghasilkan jawaban saat ini. Silakan coba lagi.';
            }
            send({ type: 'text', data: msg });
          }

          // 8. Dynamic Source Filtering (Post-Generation)
          // Only attach sources when the answer actually cites a Pasal — greetings,
          // small talk and "tidak ditemukan" answers should show no source card.
          const citedPasals = Array.from(fullAnswer.matchAll(/Pasal\s*(\d+)/gi)).map(m => m[1]);

          const filteredMatches = citedPasals.length > 0
            ? matches.filter((m: any) => {
                const pno = (m.metadata?.pasal || "").toString();
                return citedPasals.some(cp => pno === cp || pno.startsWith(cp + " ") || pno.startsWith(cp + " ayat"));
              })
            : [];

          const finalSources = filteredMatches.slice(0, 3);
          if (finalSources.length > 0) {
            send({ type: 'sources', data: finalSources });
          }

        } catch (err: any) {
          // Surface the real cause in server logs; show a specific, friendly note.
          console.error("Stream error:", err?.status ?? err?.code ?? '', err?.message ?? err);
          const status = err?.status ?? err?.code;
          const isQuota = status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(String(err?.message ?? ''));
          send({
            type: 'text',
            data: isQuota
              ? 'Maaf, batas penggunaan API sedang penuh. Mohon tunggu sebentar lalu coba lagi.'
              : 'Maaf, terjadi gangguan saat menghasilkan jawaban. Silakan coba lagi.',
          });
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
    // Pre-stream failure (refinement, embedding, or Supabase RPC). Log the real
    // cause; differentiate quota so the disconnect is diagnosable.
    const status = error?.status ?? error?.code;
    console.error("API Error:", status ?? '', error?.message ?? error);
    const isQuota = status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(String(error?.message ?? ''));
    return NextResponse.json(
      {
        error: isQuota
          ? "Batas penggunaan API sedang penuh. Mohon tunggu sebentar lalu coba lagi."
          : "Terjadi kesalahan pada server.",
      },
      { status: isQuota ? 429 : 500 },
    );
  }
}