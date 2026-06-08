/**
 * Thin client that drives one gold case through the REAL chat pipeline by POSTing to a running
 * `/api/chat` and parsing the NDJSON stream. Deliberately HTTP-based so the harness exercises the
 * exact shipped route (retrieval + tagValidity + answer-safety partition + generation), not a
 * parallel reimplementation.
 */
export type GoldSource = {
  content: string;
  metadata?: { type?: string; number?: string | number; year?: string | number; pasal?: string | number };
  validity?: { state: string; repealedBy?: { number: string; year: number; label: string } };
};

export type GoldResult = {
  /** Full answer text (all `{type:'text'}` frames concatenated). */
  answerText: string;
  /** Final `{type:'sources'}` frame, each tagged with `validity`. */
  sources: GoldSource[];
  /** Raw NDJSON body (for debugging a failure). */
  raw: string;
};

export async function runCase(baseUrl: string, query: string): Promise<GoldResult> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, history: [] }),
  });
  if (!res.ok) throw new Error(`/api/chat returned ${res.status} for query: ${query}`);

  const raw = await res.text();
  let answerText = '';
  let sources: GoldSource[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let o: { type?: string; data?: unknown };
    try {
      o = JSON.parse(t);
    } catch {
      continue; // ignore non-JSON lines
    }
    if (o.type === 'text') answerText += String(o.data ?? '');
    else if (o.type === 'sources') sources = (o.data as GoldSource[]) ?? [];
  }
  return { answerText, sources, raw };
}
