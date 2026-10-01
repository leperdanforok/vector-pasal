# Analytics & Semantic Query Logging — Design

Date: 2026-09-10
Branch context: feature work on `apps/web` (Vector Pasal — Satpol PP Bolmong chatbot)
Status: approved design, ready for implementation plan

## Goal

Two capabilities, kept strictly separate:

1. **Traffic analytics** — how many people visit and use the assistant (visits, geo,
   acquisition channels, new vs returning, a "chat was used" count).
2. **Semantic capture** — the actual questions users ask, stored in a form that can be
   read and analysed later (SQL / Supabase dashboard).

## Key decision: query text does NOT go to GA4

GA4 / dataLayer *can* carry a custom `chat_query` event with the text, but we deliberately
do not, because:

- Google's ToS forbids sending PII to GA4. Legal questions to a Satpol PP tool routinely
  contain names, NIK, phone numbers, dispute details.
- GA4 event-parameter values are truncated at 100 characters — real questions are longer.
- GA4 cannot be queried for free text without the BigQuery export; it is an aggregate tool.
- Consent / ad-blockers drop a meaningful share of events, so it is not a complete log.

GA4 only ever receives a **parameterless `chat_submitted` event** (a count).

## Architecture

| Layer    | Purpose                              | Tech                                   | Storage                          |
|----------|--------------------------------------|----------------------------------------|----------------------------------|
| Traffic  | visits, geo, acquisition, chat count | GA4 via `@next/third-parties/google`   | Google (aggregates only)         |
| Semantic | the questions people ask             | server-side insert in `api/chat/route.ts` | Supabase table `chat_logs`    |

The layers never share data.

---

## Layer 1 — GA4 (consent-gated)

### Loading

- Add dependency `@next/third-parties`.
- Measurement ID lives in `apps/web/.env` as `NEXT_PUBLIC_GA_ID` (value: `G-XZR2F6J99K`).
  Not hardcoded — preview deploys leave it unset and ship zero analytics JS.
- `<GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />` rendered in
  `apps/web/src/app/layout.tsx`, next to the existing `<Analytics />` (Vercel), **only when**
  the env var is set **and** consent has been granted.

### Consent

- Consent-gated: **no gtag.js loads until the user clicks "Terima".**
- New client component `ConsentBar` (`apps/web/src/components/consent/ConsentBar.tsx`):
  - Reads a `localStorage` key `vp-analytics-consent` (`"granted"` | `"denied"` | unset).
  - Unset → renders a fixed-position bottom bar: short Indonesian text + "Terima" / "Tolak".
  - Fixed overlay, not in document flow → no layout shift, no CLS penalty.
  - On "Terima" → set key, render `<GoogleAnalytics>` (state lifted to a small provider or
    a client wrapper in `layout.tsx`).
  - On "Tolak" → set key, never load GA.
- Copy (draft): *"Situs ini memakai Google Analytics untuk memahami penggunaan layanan.
  Tidak ada isi pertanyaan Anda yang dikirim ke Google."* + link to `/privasi`.

### Privacy page

- New route `apps/web/src/app/[locale]/privasi/page.tsx` (static content, localized `id`/`en`).
- States: anonymous traffic analytics via GA4 (only with consent); chat questions are logged
  server-side in anonymised form to improve the service; automated best-effort removal of
  personal data (NIK, phone, email, NPWP, name after title); 90-day retention; no sale/sharing.
- Wording is "berupaya menghapus" (best effort), never a guarantee.

### CSP (`apps/web/next.config.ts`)

Current `connect-src` only allows `*.supabase.co` / `*.supabase.in`. Add:

- `script-src`: `https://*.googletagmanager.com`
- `connect-src`: `https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com`
- `img-src`: `https://*.google-analytics.com https://*.googletagmanager.com`

Without this, GA fails silently.

### `chat_submitted` event

- Fired from `apps/web/src/app/[locale]/page.tsx` after a chat response stream completes
  successfully, via `sendGAEvent('event', 'chat_submitted')` from `@next/third-parties/google`.
- No parameters — a count only.
- No-op automatically when GA is not loaded (no consent / no env var).

---

## Layer 2 — `chat_logs` (server-side semantic capture)

### Migration `packages/supabase/migrations/069_chat_logs.sql`

(`068` is the current highest on this branch; `069` is next. Append-only.)

```sql
create table if not exists chat_logs (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  session_hash   text,                       -- SHA-256(sessionId + CHAT_LOG_SALT), nullable
  query_raw      text not null,              -- AFTER pii scrub
  query_refined  text,                       -- Gemini-rewritten keywords
  response_state text,                       -- live / gated / successor_unretrieved / ...
  pii_scrubbed   boolean not null default false
);

create index if not exists chat_logs_created_at_idx on chat_logs (created_at desc);

alter table chat_logs enable row level security;
-- No policies: only the service-role client (which bypasses RLS) reads/writes.
-- anon / authenticated get nothing.
```

Fields deliberately excluded (scoped out): cited Pasal refs, latency, full answer text.

### Retention — 90 days

Preferred: `pg_cron` in the same migration —

```sql
select cron.schedule(
  'chat_logs_purge',
  '17 3 * * *',
  $$delete from chat_logs where created_at < now() - interval '90 days'$$
);
```

If `pg_cron` is not enabled on the project (verify during implementation): fallback is a
Vercel Cron (`apps/web/vercel.json`) hitting a new `apps/web/src/app/api/cron/purge-chat-logs/route.ts`
guarded by a `CRON_SECRET` bearer check. Decide which at implementation time based on
`select * from pg_extension where extname = 'pg_cron'`.

### PII scrub — `apps/web/src/lib/pii-scrub.ts`

Pure, synchronous, no deps:

```ts
export function scrubPii(text: string): { text: string; scrubbed: boolean }
```

Patterns (best-effort, Indonesian-aware):

| Target | Rule (approx) | Replacement |
|--------|---------------|-------------|
| NIK    | 16 consecutive digits (word-bounded) | `[NIK]` |
| NPWP   | `\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}` | `[NPWP]` |
| Phone  | `(\+62|62|0)8[0-9]{7,12}` | `[TELP]` |
| Email  | standard email regex | `[EMAIL]` |
| Name after title | `\b(Bapak|Ibu|Bpk|Sdr|Sdri|Saudara)\.?\s+[A-Z][a-z]+(\s+[A-Z][a-z]+){0,2}` | keep title + `[NAMA]` |

**Explicitly NOT implemented:**

- Vehicle plate detection — dropped (false positives on "Perda DB 3" etc.).
- General name detection — too lossy.

`scrubbed` is `true` if any pattern matched. False-positive guards required in tests
(e.g. "Pasal 16", "tahun 2024", "Rp 1.500.000" must pass through untouched; a bare
4-digit or 10-digit number is not a NIK).

### Logging module — `apps/web/src/lib/chat-log.ts`

```ts
export async function logChatQuery(input: {
  query: string;
  refinedQuery: string;
  responseState: string;
  sessionId?: string;
}): Promise<void>
```

- Runs `scrubPii(input.query)`.
- `session_hash` = `crypto.createHash('sha256').update(sessionId + process.env.CHAT_LOG_SALT).digest('hex')`
  when `sessionId` present, else `null`. `CHAT_LOG_SALT` is a new server env var
  (`apps/web/.env`); if unset, log a one-time warning and store `null` session_hash
  (do not throw).
- Inserts one row via the **existing service-role `supabase` client** already imported in
  `route.ts` (pass it in, or re-create in the module — implementation detail).
- Wraps everything in try/catch; on failure `console.warn('[chat:log] …')` and returns.
  **Never throws.**

### Wiring in `apps/web/src/app/api/chat/route.ts`

- After `disposition` / `responseState` is computed (currently ~line 207, before the
  `ReadableStream` is built), call:

  ```ts
  const logPromise = logChatQuery({
    query,
    refinedQuery,
    responseState,
    sessionId: body?.sessionId,
  });
  ```

- Ensure completion without blocking the response using `after()` from `next/server`
  (Next 16 native — delegates to Vercel `waitUntil` in prod, runs inline in `next dev`):

  ```ts
  import { after } from 'next/server';
  // ...
  after(() => logChatQuery({ query, refinedQuery, responseState, sessionId }));
  ```

  (No new dependency. A bare floating promise is NOT acceptable — Vercel
  freezes the function after the response and can kill it.)

- `logChatQuery` is never `await`ed on the request path. A logging outage cannot affect
  or delay an answer.

### Frontend — `apps/web/src/app/[locale]/page.tsx`

- On first `submitQuery`, ensure a session id:

  ```ts
  let sid = sessionStorage.getItem('vp-session-id');
  if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem('vp-session-id', sid); }
  ```

- Add `sessionId: sid` to the existing POST body (`{ query, history, sessionId }`).
- After the stream loop finishes without error, call `sendGAEvent('event', 'chat_submitted')`.

---

## Data flow

1. User submits a question. Client ensures `vp-session-id` in `sessionStorage`, POSTs
   `{ query, history, sessionId }`.
2. `route.ts` runs refinement + embedding + retrieval + validity as today, computes
   `responseState`.
3. `route.ts` schedules `logChatQuery(...)` with `after()`.
   `logChatQuery` scrubs PII, hashes the session id, inserts one `chat_logs` row.
4. The answer streams to the client unchanged.
5. On stream completion the client fires `chat_submitted` to GA4 (only if consent granted).
6. Nightly `pg_cron` job deletes `chat_logs` rows older than 90 days.

## Error handling

| Failure | Behaviour |
|---------|-----------|
| `chat_logs` insert fails | `console.warn('[chat:log] …')`; user unaffected |
| `CHAT_LOG_SALT` unset | warn once; store `session_hash = null`; continue |
| `NEXT_PUBLIC_GA_ID` unset | `<GoogleAnalytics>` not rendered; `sendGAEvent` is a no-op |
| User denies / ignores consent | gtag.js never loads; `chat_submitted` no-ops |
| CSP not updated | GA silently fails — covered by a manual check in Done criteria |
| `pg_cron` unavailable | fall back to Vercel Cron + `CRON_SECRET` route |

## Testing / Definition of Done

- `npm run test` green, including new `apps/web/src/lib/__tests__/pii-scrub.test.ts`:
  - each pattern masked correctly
  - false-positive guards: "Pasal 16", "tahun 2024", "Rp 1.500.000", bare 10-digit number
  - `scrubbed` flag correct in both directions
- Dev manual check:
  - submit a question containing a fake NIK + phone → `chat_logs` row appears with
    `[NIK]` / `[TELP]`, `pii_scrubbed = true`, `query_refined` populated,
    `response_state` set, `session_hash` a 64-char hex.
  - stream still starts with no added latency.
- GA4 manual check:
  - fresh browser → no `googletagmanager` request until "Terima" clicked.
  - after consent → GA4 Realtime shows the page_view; submitting a chat shows
    `chat_submitted`.
  - browser console shows no CSP violations on load or after consent.
- `npm run lint` and `npm run build` clean.

## Files touched

New:
- `packages/supabase/migrations/069_chat_logs.sql`
- `apps/web/src/lib/pii-scrub.ts`
- `apps/web/src/lib/chat-log.ts`
- `apps/web/src/lib/__tests__/pii-scrub.test.ts`
- `apps/web/src/components/consent/ConsentBar.tsx` (+ any small client wrapper for GA)
- `apps/web/src/app/[locale]/privasi/page.tsx`
- possibly `apps/web/src/app/api/cron/purge-chat-logs/route.ts` (only if pg_cron unavailable)

Modified:
- `apps/web/package.json` (`@next/third-parties`)
- `apps/web/src/app/layout.tsx` (consent-gated `<GoogleAnalytics>`)
- `apps/web/next.config.ts` (CSP)
- `apps/web/src/app/api/chat/route.ts` (`logChatQuery` + `after()`)
- `apps/web/src/app/[locale]/page.tsx` (sessionId in body, `chat_submitted` event)
- `apps/web/vercel.json` (only if Vercel Cron fallback is used)
- `.env` documentation (`NEXT_PUBLIC_GA_ID`, `CHAT_LOG_SALT`, maybe `CRON_SECRET`)

## Out of scope

- Cited Pasal refs / latency / full answer text in `chat_logs`
- Vehicle-plate and general-name PII detection
- An admin UI for browsing questions (SQL / Supabase dashboard is the interface for now)
- BigQuery export from GA4
- i18n of the privacy page beyond `id` / `en`
