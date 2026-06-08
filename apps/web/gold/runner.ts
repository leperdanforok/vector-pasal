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

/**
 * Transient upstream failure (e.g. Gemini `503 high demand`), NOT a regression. The harness
 * retries on this and ultimately SKIPs the case rather than failing it — a red gold case must
 * mean a real ground-truth/safety regression, never "Gemini was busy".
 */
export class UpstreamUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}

// User-facing messages the route streams when generation fails upstream (it surfaces these as
// `{type:'text'}`, not a machine-readable frame). Treat them as transient so a 503 mid-stream
// isn't mistaken for a real (empty-source) answer.
const TRANSIENT_MARKERS = [
  'terjadi gangguan saat menghasilkan jawaban',
  'batas penggunaan API sedang penuh',
  'sistem tidak dapat menghasilkan jawaban',
  'pembatasan kutipan teks (RECITATION)',
  'diblokir oleh filter keamanan',
];

/** One attempt. Throws `UpstreamUnavailableError` on a transient (retryable) failure. */
export async function runCase(baseUrl: string, query: string): Promise<GoldResult> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, history: [] }),
  });

  // 5xx = upstream/server (e.g. the route's outer catch on a Gemini 503) → retryable.
  if (res.status >= 500) {
    throw new UpstreamUnavailableError(`/api/chat ${res.status} (upstream, likely Gemini 503) for: ${query}`);
  }
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

  // A substantive legal query always streams *some* answer; empty = a hard upstream failure.
  if (!answerText.trim()) {
    throw new UpstreamUnavailableError(`empty answer (upstream failure) for: ${query}`);
  }
  // The route streamed a transient-error notice instead of an answer.
  const marker = TRANSIENT_MARKERS.find((m) => answerText.includes(m));
  if (marker) {
    throw new UpstreamUnavailableError(`route streamed transient-error notice ("${marker}…") for: ${query}`);
  }

  return { answerText, sources, raw };
}

/**
 * `runCase` with bounded retries on `UpstreamUnavailableError` (linear backoff). Real errors
 * (4xx, assertion-relevant responses) are surfaced immediately, not retried.
 */
export async function runCaseWithRetry(
  baseUrl: string,
  query: string,
  retries = 2,
  backoffMs = 3000,
): Promise<GoldResult> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await runCase(baseUrl, query);
    } catch (e) {
      if (!(e instanceof UpstreamUnavailableError)) throw e; // not transient — surface now
      last = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    }
  }
  throw last;
}
