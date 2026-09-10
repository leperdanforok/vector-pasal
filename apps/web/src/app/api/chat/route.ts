import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai'; // <-- NEW SDK IMPORT
import { SYSTEM_INSTRUCTION, buildRefinementPrompt, buildUserPrompt } from '@/lib/prompt';
import { tagValidity, classifyByValidity, decideAnswer, type ValidityInfo } from '@/lib/validity';

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

// --- Upstream-resilience helpers ----------------------------------------------------
// Goal: survive peak-hour Gemini 503/UNAVAILABLE without masking real bugs.
// `isUpstreamBusy` is intentionally narrow — only Gemini's "service unavailable"
// signature is treated as retryable. 429 (quota) and other 4xx are NOT retried:
// quota has a different remediation, and retrying a real bug would just hide it.
const isUpstreamBusy = (err: any): boolean => {
  const status = err?.status ?? err?.code;
  if (status === 429) return false;
  if (status === 503) return true;
  const msg = String(err?.message ?? err ?? '');
  return /\b503\b|UNAVAILABLE|Service Unavailable/i.test(msg);
};

const BUSY_MESSAGE = 'Sistem sedang sibuk, silakan coba lagi sebentar.';

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; backoffMs?: number; label: string },
): Promise<T> {
  const retries = opts.retries ?? 2;
  const backoffMs = opts.backoffMs ?? 500;
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isUpstreamBusy(err) || attempt === retries) throw err;
      const delay = backoffMs * (attempt + 1);
      console.warn(
        `[chat:retry] ${opts.label} attempt ${attempt + 1}/${retries} failed ` +
          `(status=${err?.status ?? err?.code ?? 'n/a'}, msg=${(err?.message ?? '').toString().slice(0, 120)}); ` +
          `retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query, history } = body as { query: string; history?: ChatHistoryMessage[] };

    // 3. User Query Refinement & Embedding generation (Parallelized for P0)
    const refinementPrompt = buildRefinementPrompt(query);

    // Refinement is NON-ESSENTIAL — fall back to the raw query on ANY error so an
    // upstream hiccup never 503s the whole request. Not retried: retrying a
    // non-essential call adds load for no user benefit.
    const refinementPromise = ai.models
      .generateContent({
        model: 'gemini-2.5-flash',
        contents: refinementPrompt,
        config: { temperature: 0 },
      })
      .catch((err: any) => {
        console.warn(
          `[chat:fallback] refinement failed ` +
            `(status=${err?.status ?? err?.code ?? 'n/a'}, msg=${(err?.message ?? '').toString().slice(0, 120)}); ` +
            `using raw query`,
        );
        return null;
      });

    // Embedding IS load-bearing — retry with short backoff on 503/UNAVAILABLE.
    // If still failing after retries, propagate to the outer catch which streams
    // the calm "sistem sibuk" message.
    const embeddingPromise = withRetry(
      () =>
        ai.models.embedContent({
          model: 'gemini-embedding-001',
          contents: query, // Use ORIGINAL query for embedding (fast path)
          config: {
            outputDimensionality: 768,
            taskType: 'RETRIEVAL_QUERY',
          },
        }),
      { retries: 2, backoffMs: 500, label: 'embedding' },
    );

    const [refinementResponse, embeddingResponse] = await Promise.all([
      refinementPromise,
      embeddingPromise,
    ]);

    const refinedQuery = refinementResponse?.text?.trim() || query;
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

    // Merge and deduplicate by node ID. Each row carries work_id (the vector RPC now returns
    // it; the FTS RPC already did) — required for deterministic validity tagging.
    const seenIds = new Set<number>();
    const matches: any[] = [];
    const mergeRows = (rows: any[] | null | undefined, into: any[]) => {
      for (const match of rows || []) {
        const id = match.node_id || match.id;
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          into.push({ ...match, id });
        }
      }
    };
    mergeRows(vectorResults.data, matches);
    mergeRows(ftsResults.data, matches);

    // --- Legal-validity tagging (deterministic, NEVER the LLM) -------------------------
    // Tag each matched node by its work's validity, then partition so the model is
    // physically unable to answer from dead law when a live source exists.
    const LIVE: ValidityInfo = { state: 'live' };
    const validityMap = await tagValidity(matches.map((m) => m.work_id), supabase);
    for (const m of matches) {
      m.validity = (typeof m.work_id === 'number' && validityMap.get(m.work_id)) || LIVE;
    }

    const { live: liveMatches, repealedWithSuccessor: rsMatches, repealedNoSuccessor: rnMatches } =
      classifyByValidity(matches);

    // Force-fetch the live successor article(s) for any repealed_with_successor match. This is
    // what closes the "0 live nodes but successor exists" hole: we re-run the sanction-aware
    // hybrid search scoped to the successor work (reusing refinedQuery + queryVector) instead
    // of ever feeding the dead node to the model.
    const successorMatches: any[] = [];
    const successorWorkIds = Array.from(new Set(
      rsMatches
        .map((m) => m.validity.repealedBy?.successorWorkId)
        .filter((w): w is number => typeof w === 'number'),
    ));
    if (successorWorkIds.length > 0) {
      const successorValidity = await tagValidity(successorWorkIds, supabase);
      const fetched = await Promise.all(successorWorkIds.flatMap((wid) => [
        supabase.rpc('search_legal_chunks', {
          query_text: refinedQuery, match_count: 10, metadata_filter: { work_id: wid },
        }),
        supabase.rpc('match_legal_chunks', {
          query_embedding: queryVector, match_threshold: 0.1, match_count: 10, filter_work_id: wid,
        }),
      ]));
      for (const res of fetched) {
        if (res.error) { console.error('Force-fetch successor failed:', res.error.message ?? res.error); continue; }
        mergeRows(res.data, successorMatches);
      }
      for (const m of successorMatches) {
        m.validity = (typeof m.work_id === 'number' && successorValidity.get(m.work_id)) || LIVE;
      }
    }

    // Decide what the model may answer from (pure, deterministic, unit-tested).
    const disposition = decideAnswer({
      liveMatches,
      successorLiveMatches: successorMatches.filter((m) => m.validity.state === 'live'),
      repealedNoSuccessor: rnMatches,
      repealedWithSuccessor: rsMatches,
    });
    const answerNodes = disposition.answerNodes;
    const gated = disposition.gated;
    const responseState = disposition.responseState;
    // successor_unretrieved: serve the notice and NO dead content.
    const forcedMessage = responseState === 'successor_unretrieved'
      ? `Aturan yang Anda tanyakan sudah tidak berlaku dan telah diperbarui oleh ${disposition.successorLabel}. Namun teks pasal penggantinya tidak berhasil saya tampilkan untuk pertanyaan ini. Mohon verifikasi langsung dengan Bagian Hukum Kabupaten Bolaang Mongondow.`
      : null;
    console.log(`Validity: live=${liveMatches.length} rs=${rsMatches.length} rn=${rnMatches.length} successorFetched=${successorMatches.length} -> responseState=${responseState}`);

    // 5. Build the legal context for the AI from the ELIGIBLE nodes only (Token Trimmed).
    const contextText = answerNodes.length > 0
      ? answerNodes.map((match: any) => {
          const meta = match.metadata || {};
          // Lampiran tariff nodes carry a roman-numeral number ("I.54", "II.12.1"), not an
          // Arabic Pasal number — label them "Lampiran" so the model cites them correctly.
          const label = meta.node_type === 'lampiran_tarif' ? 'Lampiran' : 'Pasal';
          const ref = `[Perda No ${meta.number || '?'}/${meta.year || '?'}, ${label} ${meta.pasal || '?'}]`;

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
          // RETRY BOUNDARY: only the stream-initiation call is retryable. A 503 here
          // means no bytes were ever sent to the client → safe to retry. Once we
          // enter the `for await` loop below, a failure MUST NOT retry — retrying
          // after partial stream would duplicate text the user already saw.
          const stream = await withRetry(
            () =>
              ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents,
                config: { systemInstruction, temperature },
              }),
            { retries: 2, backoffMs: 500, label: 'generation' },
          );
          // ---- HARD STOP: no retry past this line. Mid-stream errors propagate. ----
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
          // successor_unretrieved: a live successor is known to exist but we couldn't fetch
          // its article. Serve the deterministic notice and NO dead content / sources.
          if (forcedMessage) {
            send({ type: 'text', data: forcedMessage });
            controller.close();
            return;
          }

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
          // Hero sources are the cited ELIGIBLE (live / live-successor / gated) nodes — never
          // a dead repealed_with_successor node. Greetings / "tidak ditemukan" cite nothing →
          // no card. Each source carries its `validity` for the UI to render deterministically.
          const citedPasals = Array.from(fullAnswer.matchAll(/Pasal\s*(\d+)/gi)).map(m => m[1]);
          // Lampiran citations look like "Lampiran I.54" / "Lampiran II.12.1" (roman numeral,
          // optionally dotted) — a separate shape from "Pasal N".
          const citedLampiran = Array.from(fullAnswer.matchAll(/Lampiran\s+([IVXLC]+(?:\.\d+)*)/gi)).map(m => m[1]);
          const isCited = (m: any) => {
            const meta = m.metadata || {};
            const pno = (meta.pasal || "").toString();
            if (meta.node_type === 'lampiran_tarif') {
              // Exact ("I.54") or section-prefix ("Lampiran I" → any I.x) match.
              return citedLampiran.some(cl => pno === cl || pno.startsWith(cl + "."));
            }
            return citedPasals.some(cp => pno === cp || pno.startsWith(cp + " ") || pno.startsWith(cp + " ayat"));
          };

          const heroSources = (citedPasals.length > 0 || citedLampiran.length > 0)
            ? answerNodes.filter(isCited).slice(0, 3)
            : [];

          // Demote a repealed reference only when the live answer comes from ITS successor —
          // i.e. "the older version of what you're reading". This shows the Walet 2/2021 ref
          // under a 1/2024 walet answer, but suppresses unrelated repealed matches (e.g. a
          // stray walet Pasal pulled into a narkotika answer by lenient recall).
          const heroWorkIds = new Set(heroSources.map((m: any) => m.work_id));
          const demotedSources = (!gated && heroSources.length > 0)
            ? rsMatches
                .filter((m: any) => {
                  const sid = m.validity.repealedBy?.successorWorkId;
                  return typeof sid === 'number' && heroWorkIds.has(sid);
                })
                .slice(0, 3)
            : [];

          // `role` distinguishes the answer-grounding source (hero) from a demoted "older
          // version" reference. The gold harness keys its validity guard on this: a hero source
          // must never be a repealed work (demoted refs legitimately are).
          const toSource = (m: any, role: 'hero' | 'demoted') => ({
            content: m.content || m.content_text || '',
            metadata: m.metadata,
            validity: m.validity,
            role,
          });

          const finalSources = [
            ...heroSources.map((m: any) => toSource(m, 'hero')),
            ...demotedSources.map((m: any) => toSource(m, 'demoted')),
          ];
          if (finalSources.length > 0) {
            send({ type: 'sources', data: finalSources });
          }

        } catch (err: any) {
          // Surface the real cause in server logs; show a specific, friendly note.
          const status = err?.status ?? err?.code;
          const isBusy = isUpstreamBusy(err);
          const isQuota = status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(String(err?.message ?? ''));
          console.error(
            `[chat:stream-error] status=${status ?? ''} busy=${isBusy} quota=${isQuota} ` +
              `msg=${(err?.message ?? err ?? '').toString().slice(0, 200)}`,
          );
          send({
            type: 'text',
            data: isBusy
              ? BUSY_MESSAGE
              : isQuota
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
    // cause; differentiate quota and upstream-busy so the disconnect is diagnosable.
    const status = error?.status ?? error?.code;
    const isBusy = isUpstreamBusy(error);
    const isQuota = status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(String(error?.message ?? ''));
    console.error(
      `[chat:pre-stream-error] status=${status ?? ''} busy=${isBusy} quota=${isQuota} ` +
        `msg=${(error?.message ?? error ?? '').toString().slice(0, 200)}`,
    );

    if (isBusy) {
      // Stream the calm busy message as a normal assistant NDJSON turn so the UI
      // renders it inline, NOT as a 500 error overlay. "Busy, retry" vs "broken".
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: 'text', data: BUSY_MESSAGE }) + '\n'),
          );
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-cache, no-transform',
        },
      });
    }

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