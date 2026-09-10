# Analytics & Semantic Query Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consent-gated GA4 traffic analytics and a PII-scrubbed server-side log of chat questions in a queryable Supabase table.

**Architecture:** Two independent layers. GA4 (via `@next/third-parties/google`) loads only after explicit consent and never receives query text — only a `chat_submitted` count event. Chat questions are scrubbed of obvious PII and inserted into a new `chat_logs` table from `api/chat/route.ts`, off the response critical path via Vercel `waitUntil`.

**Tech Stack:** Next.js 16 App Router, TypeScript, vitest, Supabase (pgvector + pg_cron), `@next/third-parties`, `@vercel/functions`, Node `crypto`.

**Spec:** `docs/superpowers/specs/2026-09-10-analytics-and-query-logging-design.md`

## Global Constraints

- Migrations are append-only and numbered. Current highest is `059`; the new migration is `060_chat_logs.sql`. Never edit a shipped migration.
- GA4 Measurement ID is `G-XZR2F6J99K`, read from env `NEXT_PUBLIC_GA_ID`. Never hardcode it in source.
- Query text MUST NOT be sent to GA4 in any form. GA4 receives only a parameterless `chat_submitted` event.
- The chat log insert MUST NOT be `await`ed on the request path and MUST NOT throw. A logging failure is `console.warn('[chat:log] ...')` and nothing else.
- Use Vercel `waitUntil()` for the insert promise — a bare floating promise is not acceptable (Vercel freezes the function after the response).
- PII scrub is best-effort. Patterns: NIK (16 digits), NPWP, phone, email, name-after-title. NO vehicle-plate detection. NO general name detection.
- `chat_logs` retention is 90 days.
- `chat_logs` fields are exactly: `id, created_at, session_hash, query_raw, query_refined, response_state, pii_scrubbed`. Do not add cited-Pasal refs, latency, or full answer text.
- Web app test command: `cd apps/web && npm run test` (vitest). Single file: `npx vitest run src/lib/__tests__/<file>`.
- Tests for `apps/web` live in `apps/web/src/lib/__tests__/`.
- Consent copy (Indonesian): `Situs ini memakai Google Analytics untuk memahami penggunaan layanan. Tidak ada isi pertanyaan Anda yang dikirim ke Google.` with buttons `Terima` / `Tolak` and a link to `/privasi`.
- New env vars to document in `apps/web/.env` (and any `.env.example`): `NEXT_PUBLIC_GA_ID`, `CHAT_LOG_SALT`.

---

### Task 1: PII scrub module

**Files:**
- Create: `apps/web/src/lib/pii-scrub.ts`
- Test: `apps/web/src/lib/__tests__/pii-scrub.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function scrubPii(text: string): { text: string; scrubbed: boolean }`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/__tests__/pii-scrub.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scrubPii } from '@/lib/pii-scrub';

describe('scrubPii', () => {
  it('masks a 16-digit NIK', () => {
    const r = scrubPii('KTP saya 3171234567890123 hilang');
    expect(r.text).toBe('KTP saya [NIK] hilang');
    expect(r.scrubbed).toBe(true);
  });

  it('masks an NPWP', () => {
    expect(scrubPii('NPWP 09.254.294.3-407.000').text).toBe('NPWP [NPWP]');
  });

  it('masks Indonesian phone numbers', () => {
    expect(scrubPii('hubungi 081234567890').text).toBe('hubungi [TELP]');
    expect(scrubPii('hubungi +6281234567890').text).toBe('hubungi [TELP]');
  });

  it('masks email addresses', () => {
    expect(scrubPii('kirim ke andi@example.co.id ya').text).toBe('kirim ke [EMAIL] ya');
  });

  it('masks a name after a title', () => {
    expect(scrubPii('laporan dari Bapak Andi Wijaya soal parkir').text)
      .toBe('laporan dari Bapak [NAMA] soal parkir');
  });

  it('does not touch legal-reference numbers', () => {
    const inputs = [
      'Pasal 16 ayat 2',
      'Perda Nomor 4 Tahun 2024',
      'denda Rp 1.500.000',
      'tahun 2024 nomor 12345',
    ];
    for (const i of inputs) {
      const r = scrubPii(i);
      expect(r.text).toBe(i);
      expect(r.scrubbed).toBe(false);
    }
  });

  it('reports scrubbed=false when nothing matches', () => {
    expect(scrubPii('Berapa tarif retribusi parkir?')).toEqual({
      text: 'Berapa tarif retribusi parkir?',
      scrubbed: false,
    });
  });

  it('handles multiple PII items in one string', () => {
    const r = scrubPii('NIK 3171234567890123 telp 081234567890');
    expect(r.text).toBe('NIK [NIK] telp [TELP]');
    expect(r.scrubbed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/__tests__/pii-scrub.test.ts`
Expected: FAIL — cannot resolve `@/lib/pii-scrub`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/pii-scrub.ts`:

```ts
/**
 * Best-effort removal of obvious personal data from free-text chat queries
 * before they are stored. NOT a guarantee — the privacy notice wording
 * ("kami berupaya menghapus data pribadi") reflects that.
 *
 * Deliberately omitted: vehicle-plate detection (false positives on things
 * like "Perda DB 3") and general name detection (too lossy).
 */

type Rule = { re: RegExp; replace: string };

const RULES: Rule[] = [
  // Email — run before phone/NIK so digits inside an address aren't clipped.
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replace: '[EMAIL]' },
  // NPWP: 09.254.294.3-407.000
  { re: /\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\b/g, replace: '[NPWP]' },
  // NIK: exactly 16 consecutive digits, not part of a longer digit run.
  { re: /(?<!\d)\d{16}(?!\d)/g, replace: '[NIK]' },
  // Indonesian mobile: +62/62/0 followed by 8 and 8–13 more digits.
  { re: /(?<!\d)(?:\+62|62|0)8\d{7,12}(?!\d)/g, replace: '[TELP]' },
  // Name after an honorific: keep the title, mask 1–3 capitalised words.
  {
    re: /\b(Bapak|Ibu|Bpk|Sdr|Sdri|Saudara)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}/g,
    replace: '$1 [NAMA]',
  },
];

export function scrubPii(text: string): { text: string; scrubbed: boolean } {
  let out = text;
  for (const { re, replace } of RULES) {
    out = out.replace(re, replace);
  }
  return { text: out, scrubbed: out !== text };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/__tests__/pii-scrub.test.ts`
Expected: PASS (all 8 tests). If the "Rp 1.500.000" case fails because the NPWP
regex is too greedy, tighten the NPWP `\b` anchors — do not loosen the NIK rule.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pii-scrub.ts apps/web/src/lib/__tests__/pii-scrub.test.ts
git commit -m "feat: add best-effort PII scrub for chat query logging"
```

---

### Task 2: chat_logs table + retention migration

**Files:**
- Create: `packages/supabase/migrations/060_chat_logs.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `chat_logs(id, created_at, session_hash, query_raw, query_refined, response_state, pii_scrubbed)`; nightly purge of rows older than 90 days.

- [ ] **Step 1: Check pg_cron availability**

Run (Supabase SQL editor or MCP `execute_sql`):
```sql
select extname from pg_extension where extname = 'pg_cron';
```
- If it returns a row → use the `pg_cron` block in Step 2.
- If empty → still write the migration WITHOUT the `cron.schedule` call, and add
  Task 2b (below) for a Vercel Cron fallback. Note the choice in the commit message.

- [ ] **Step 2: Write the migration**

Create `packages/supabase/migrations/060_chat_logs.sql`:

```sql
-- 060_chat_logs.sql
-- Server-side log of chat questions for "what are people asking" analysis.
-- Written only by the service-role client from apps/web/src/app/api/chat/route.ts.
-- Query text is PII-scrubbed before insert (apps/web/src/lib/pii-scrub.ts).

create table if not exists chat_logs (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  session_hash   text,
  query_raw      text not null,
  query_refined  text,
  response_state text,
  pii_scrubbed   boolean not null default false
);

create index if not exists chat_logs_created_at_idx on chat_logs (created_at desc);

alter table chat_logs enable row level security;
-- Intentionally NO policies: only the service-role client (bypasses RLS) touches
-- this table. anon / authenticated get zero access.

-- Retention: 90 days. Requires pg_cron (verified enabled in Step 1).
select cron.schedule(
  'chat_logs_purge',
  '17 3 * * *',
  $$delete from chat_logs where created_at < now() - interval '90 days'$$
);
```

- [ ] **Step 3: Apply the migration**

Apply via the project's normal migration path (Supabase MCP `apply_migration` with
name `chat_logs`, or the SQL editor). Then verify:
```sql
select column_name, data_type from information_schema.columns
where table_name = 'chat_logs' order by ordinal_position;
select jobname, schedule from cron.job where jobname = 'chat_logs_purge';
```
Expected: 7 columns in the listed order; one cron job (if pg_cron path).

- [ ] **Step 4: Commit**

```bash
git add packages/supabase/migrations/060_chat_logs.sql
git commit -m "feat(db): add chat_logs table with 90-day retention"
```

---

### Task 2b: Vercel Cron purge fallback (ONLY if pg_cron unavailable)

**Skip this task entirely if Task 2 Step 1 found pg_cron enabled.**

**Files:**
- Create: `apps/web/src/app/api/cron/purge-chat-logs/route.ts`
- Modify: `apps/web/vercel.json`
- Modify: `apps/web/.env` (document `CRON_SECRET`)

**Interfaces:**
- Consumes: Supabase service client.
- Produces: `GET /api/cron/purge-chat-logs` — deletes `chat_logs` older than 90 days when called with `Authorization: Bearer $CRON_SECRET`.

- [ ] **Step 1: Write the route**

Create `apps/web/src/app/api/cron/purge-chat-logs/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await supabase
    .from('chat_logs')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (error) {
    console.error('[cron:purge-chat-logs]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ deleted: count ?? 0 });
}
```

- [ ] **Step 2: Add the cron schedule**

In `apps/web/vercel.json`, add (merge with existing content):

```json
{
  "crons": [
    { "path": "/api/cron/purge-chat-logs", "schedule": "17 3 * * *" }
  ]
}
```

- [ ] **Step 3: Document the secret**

Add to `apps/web/.env`:
```
CRON_SECRET=<generate a random 32+ char string>
```
Set the same value in Vercel project env vars (Vercel injects `Authorization: Bearer $CRON_SECRET` automatically for cron invocations).

- [ ] **Step 4: Verify locally**

Run: `cd apps/web && npm run dev`, then
`curl -s -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/purge-chat-logs`
Expected: `{"deleted":0}`. Without the header: `401`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/cron/purge-chat-logs/route.ts apps/web/vercel.json
git commit -m "feat: Vercel Cron fallback for chat_logs retention"
```

---

### Task 3: chat log builder + writer module

**Files:**
- Create: `apps/web/src/lib/chat-log.ts`
- Test: `apps/web/src/lib/__tests__/chat-log.test.ts`

**Interfaces:**
- Consumes: `scrubPii` from `@/lib/pii-scrub` (Task 1).
- Produces:
  - `export function buildChatLogRow(input: ChatLogInput, salt: string | undefined): ChatLogRow`
  - `export function logChatQuery(input: ChatLogInput): Promise<void>`
  - `export type ChatLogInput = { query: string; refinedQuery?: string; responseState?: string; sessionId?: string }`
  - `ChatLogRow = { session_hash: string | null; query_raw: string; query_refined: string | null; response_state: string | null; pii_scrubbed: boolean }`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/__tests__/chat-log.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { buildChatLogRow } from '@/lib/chat-log';

describe('buildChatLogRow', () => {
  it('scrubs PII from query_raw and sets pii_scrubbed', () => {
    const row = buildChatLogRow(
      { query: 'telp saya 081234567890', refinedQuery: 'telepon', responseState: 'live' },
      'salt',
    );
    expect(row.query_raw).toBe('telp saya [TELP]');
    expect(row.pii_scrubbed).toBe(true);
    expect(row.query_refined).toBe('telepon');
    expect(row.response_state).toBe('live');
  });

  it('hashes the session id with the salt', () => {
    const row = buildChatLogRow({ query: 'x', sessionId: 'abc' }, 'pepper');
    expect(row.session_hash).toBe(
      createHash('sha256').update('abc' + 'pepper').digest('hex'),
    );
  });

  it('stores null session_hash when no session id is given', () => {
    expect(buildChatLogRow({ query: 'x' }, 'salt').session_hash).toBeNull();
  });

  it('stores null session_hash when salt is undefined', () => {
    expect(buildChatLogRow({ query: 'x', sessionId: 'abc' }, undefined).session_hash).toBeNull();
  });

  it('nulls optional text fields when absent', () => {
    const row = buildChatLogRow({ query: 'halo' }, 'salt');
    expect(row.query_refined).toBeNull();
    expect(row.response_state).toBeNull();
    expect(row.pii_scrubbed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/__tests__/chat-log.test.ts`
Expected: FAIL — cannot resolve `@/lib/chat-log`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/chat-log.ts`:

```ts
import 'server-only';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { scrubPii } from '@/lib/pii-scrub';

export type ChatLogInput = {
  query: string;
  refinedQuery?: string;
  responseState?: string;
  sessionId?: string;
};

export type ChatLogRow = {
  session_hash: string | null;
  query_raw: string;
  query_refined: string | null;
  response_state: string | null;
  pii_scrubbed: boolean;
};

let warnedNoSalt = false;

export function buildChatLogRow(input: ChatLogInput, salt: string | undefined): ChatLogRow {
  const { text, scrubbed } = scrubPii(input.query ?? '');
  let sessionHash: string | null = null;
  if (input.sessionId && salt) {
    sessionHash = createHash('sha256').update(input.sessionId + salt).digest('hex');
  } else if (input.sessionId && !salt && !warnedNoSalt) {
    warnedNoSalt = true;
    console.warn('[chat:log] CHAT_LOG_SALT unset — storing null session_hash');
  }
  return {
    session_hash: sessionHash,
    query_raw: text,
    query_refined: input.refinedQuery?.trim() || null,
    response_state: input.responseState?.trim() || null,
    pii_scrubbed: scrubbed,
  };
}

export async function logChatQuery(input: ChatLogInput): Promise<void> {
  try {
    const row = buildChatLogRow(input, process.env.CHAT_LOG_SALT);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { error } = await supabase.from('chat_logs').insert(row);
    if (error) console.warn('[chat:log] insert failed:', error.message);
  } catch (err: any) {
    console.warn('[chat:log] unexpected:', err?.message ?? err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/__tests__/chat-log.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full web test suite**

Run: `cd apps/web && npm run test`
Expected: all pass (new + existing).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/chat-log.ts apps/web/src/lib/__tests__/chat-log.test.ts
git commit -m "feat: add chat_logs writer with salted session hashing"
```

---

### Task 4: Wire logging into the chat route + frontend session id

**Files:**
- Modify: `apps/web/package.json` (add `@vercel/functions`)
- Modify: `apps/web/src/app/api/chat/route.ts`
- Modify: `apps/web/src/app/[locale]/page.tsx`

**Interfaces:**
- Consumes: `logChatQuery` from `@/lib/chat-log` (Task 3); `waitUntil` from `@vercel/functions`.
- Produces: every chat POST writes one `chat_logs` row; POST body now accepts optional `sessionId: string`.

- [ ] **Step 1: Add the dependency**

Run: `cd apps/web && npm install @vercel/functions`
Expected: `package.json` + lockfile updated.

- [ ] **Step 2: Add imports to the route**

In `apps/web/src/app/api/chat/route.ts`, after the existing imports (top of file):

```ts
import { waitUntil } from '@vercel/functions';
import { logChatQuery } from '@/lib/chat-log';
```

- [ ] **Step 3: Read `sessionId` from the body**

In `apps/web/src/app/api/chat/route.ts`, change the body destructure (currently
around line 65):

```ts
const { query, history, sessionId } = body as {
  query: string;
  history?: ChatHistoryMessage[];
  sessionId?: string;
};
```

- [ ] **Step 4: Fire the log after responseState is known**

In `apps/web/src/app/api/chat/route.ts`, immediately after the line that logs
`Validity: live=... -> responseState=${responseState}` (currently ~line 207,
before `// 5. Build the legal context`):

```ts
waitUntil(
  logChatQuery({ query, refinedQuery, responseState, sessionId }),
);
```

- [ ] **Step 5: Manually verify the row is written**

Run: `cd apps/web && npm run dev`. Submit a question in the browser that contains
a fake NIK, e.g. `Apakah KTP 3171234567890123 wajib untuk lapor?`

Then in Supabase SQL editor:
```sql
select session_hash, query_raw, query_refined, response_state, pii_scrubbed
from chat_logs order by created_at desc limit 1;
```
Expected: `query_raw` contains `[NIK]` (not the digits), `pii_scrubbed = true`,
`query_refined` non-null, `response_state` set, `session_hash` null (frontend not
wired yet — that's Step 6).

- [ ] **Step 6: Send a session id from the frontend**

In `apps/web/src/app/[locale]/page.tsx`, inside `submitQuery`, right after
`const q = text.trim(); if (!q || loading) return;`:

```ts
let sid: string | null = null;
try {
  sid = sessionStorage.getItem('vp-session-id');
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem('vp-session-id', sid);
  }
} catch {
  sid = null; // private mode / storage disabled — log stays anonymous
}
```

Then change the fetch body (currently `body: JSON.stringify({ query: q, history })`):

```ts
body: JSON.stringify({ query: q, history, sessionId: sid }),
```

- [ ] **Step 7: Verify session_hash now populates**

Restart `npm run dev`, submit two questions in the same tab. Then:
```sql
select session_hash, count(*) from chat_logs
where created_at > now() - interval '5 minutes'
group by session_hash;
```
Expected: both rows share one 64-char hex `session_hash`.

- [ ] **Step 8: Run tests + build**

Run: `cd apps/web && npm run test && npm run build`
Expected: pass and compile.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/app/api/chat/route.ts apps/web/src/app/[locale]/page.tsx
git commit -m "feat: log chat queries to chat_logs via waitUntil"
```

---

### Task 5: Consent-gated GA4

**Files:**
- Modify: `apps/web/package.json` (add `@next/third-parties`)
- Create: `apps/web/src/components/consent/AnalyticsGate.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/next.config.ts` (CSP)
- Modify: `apps/web/src/app/[locale]/page.tsx` (`chat_submitted` event)
- Modify: `apps/web/.env` (document `NEXT_PUBLIC_GA_ID`)

**Interfaces:**
- Consumes: `NEXT_PUBLIC_GA_ID` env var.
- Produces: `<AnalyticsGate />` client component; `localStorage['vp-analytics-consent']` = `'granted' | 'denied'`; GA4 `chat_submitted` event on successful chat responses.

- [ ] **Step 1: Add the dependency**

Run: `cd apps/web && npm install @next/third-parties`

- [ ] **Step 2: Update the CSP**

In `apps/web/next.config.ts`, replace the CSP `value` array (lines ~50–56) with:

```ts
value: [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://*.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.google-analytics.com https://*.googletagmanager.com",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  "frame-ancestors 'none'",
].join("; "),
```

- [ ] **Step 3: Create the consent gate component**

Create `apps/web/src/components/consent/AnalyticsGate.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GoogleAnalytics } from '@next/third-parties/google';

const KEY = 'vp-analytics-consent';
const CONSENT_COPY =
  'Situs ini memakai Google Analytics untuk memahami penggunaan layanan. Tidak ada isi pertanyaan Anda yang dikirim ke Google.';

export function AnalyticsGate({ gaId }: { gaId?: string }) {
  const [choice, setChoice] = useState<'granted' | 'denied' | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'granted' || v === 'denied') setChoice(v);
    } catch {
      /* storage disabled — show the bar, don't load GA */
    }
    setReady(true);
  }, []);

  const decide = (v: 'granted' | 'denied') => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
    setChoice(v);
  };

  if (!gaId || !ready) return null;

  return (
    <>
      {choice === 'granted' && <GoogleAnalytics gaId={gaId} />}
      {choice === null && (
        <div
          role="dialog"
          aria-label="Persetujuan analitik"
          style={{
            position: 'fixed',
            insetInline: 0,
            bottom: 0,
            zIndex: 60,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.9rem 1rem',
            background: '#0f2e22',
            color: '#f3f6f4',
            fontSize: '0.85rem',
            lineHeight: 1.4,
          }}
        >
          <span style={{ maxWidth: '48ch' }}>
            {CONSENT_COPY}{' '}
            <Link href="/privasi" style={{ textDecoration: 'underline', color: '#f3f6f4' }}>
              Kebijakan Privasi
            </Link>
          </span>
          <span style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => decide('denied')}
              style={{
                padding: '0.4rem 0.9rem',
                borderRadius: 6,
                border: '1px solid #f3f6f4',
                background: 'transparent',
                color: '#f3f6f4',
                cursor: 'pointer',
              }}
            >
              Tolak
            </button>
            <button
              onClick={() => decide('granted')}
              style={{
                padding: '0.4rem 0.9rem',
                borderRadius: 6,
                border: 'none',
                background: '#c8a24a',
                color: '#0f2e22',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Terima
            </button>
          </span>
        </div>
      )}
    </>
  );
}
```

Note: `next/link` (not the next-intl `Link`) is correct here — this renders in the
root layout, outside `NextIntlClientProvider`, and `/privasi` resolves under the
default locale.

- [ ] **Step 4: Mount it in the root layout**

In `apps/web/src/app/layout.tsx`:
- Add import: `import { AnalyticsGate } from "@/components/consent/AnalyticsGate";`
- In the `<body>`, directly after `<Analytics />`:

```tsx
<AnalyticsGate gaId={process.env.NEXT_PUBLIC_GA_ID} />
```

- [ ] **Step 5: Fire `chat_submitted` after a successful response**

In `apps/web/src/app/[locale]/page.tsx`:
- Add import: `import { sendGAEvent } from '@next/third-parties/google';`
- In `submitQuery`, after the `while (!isDone)` stream loop completes and before
  the closing `}` of the `try` block (i.e. right after the loop, on the success path):

```ts
try {
  if (localStorage.getItem('vp-analytics-consent') === 'granted') {
    sendGAEvent('event', 'chat_submitted');
  }
} catch {
  /* no consent / storage blocked — skip */
}
```

- [ ] **Step 6: Document the env var**

Add to `apps/web/.env` (and `.env.example` if present):
```
NEXT_PUBLIC_GA_ID=G-XZR2F6J99K
```

- [ ] **Step 7: Manual verification**

Run: `cd apps/web && npm run dev` with `NEXT_PUBLIC_GA_ID` set.
1. Fresh browser (clear site data). Open DevTools → Network, filter `googletag`.
   Expected: **no** `gtm.js` / `googletagmanager` request. Consent bar visible.
2. Click **Terima**. Expected: `googletagmanager.com/gtm.js?id=G-XZR2F6J99K` loads;
   bar disappears; GA4 → Realtime shows the page_view.
3. Submit a chat. Expected: GA4 Realtime shows a `chat_submitted` event.
4. DevTools Console: **no** `Content-Security-Policy` violation messages.
5. Reload. Expected: bar stays gone, GA loads immediately (consent persisted).
6. In a second fresh session click **Tolak**. Expected: GA never loads; no bar on reload.

- [ ] **Step 8: Build + test**

Run: `cd apps/web && npm run lint && npm run test && npm run build`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/components/consent/AnalyticsGate.tsx apps/web/src/app/layout.tsx apps/web/next.config.ts apps/web/src/app/[locale]/page.tsx
git commit -m "feat: consent-gated GA4 analytics with chat_submitted event"
```

---

### Task 6: Privacy page

**Files:**
- Create: `apps/web/src/app/[locale]/privasi/page.tsx`

**Interfaces:**
- Consumes: `locale` route param.
- Produces: static route `/privasi` (id) and `/en/privasi` (en).

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/[locale]/privasi/page.tsx`:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Kebijakan Privasi' };

const ID = {
  title: 'Kebijakan Privasi',
  body: [
    'Vector Pasal adalah asisten AI Peraturan Daerah untuk Satpol PP Kabupaten Bolaang Mongondow.',
    'Analitik lalu lintas: dengan persetujuan Anda, kami memakai Google Analytics untuk menghitung jumlah kunjungan dan penggunaan layanan secara anonim. Isi pertanyaan Anda tidak pernah dikirim ke Google.',
    'Pencatatan pertanyaan: pertanyaan yang Anda ajukan disimpan di server kami dalam bentuk anonim untuk memahami kebutuhan pengguna dan memperbaiki layanan. Sebelum disimpan, kami berupaya menghapus data pribadi yang jelas (NIK, nomor telepon, email, NPWP, dan nama setelah sapaan). Upaya ini bersifat terbaik dan tidak menjamin seluruh data pribadi terhapus — mohon tidak memasukkan data pribadi yang tidak perlu.',
    'Identitas: kami tidak menyimpan nama, alamat IP, atau akun. Sesi diberi pengenal acak yang tidak terhubung ke identitas Anda.',
    'Penyimpanan: catatan pertanyaan dihapus otomatis setelah 90 hari.',
    'Kami tidak menjual atau membagikan data ini kepada pihak lain.',
  ],
};

const EN = {
  title: 'Privacy Policy',
  body: [
    'Vector Pasal is an AI assistant for the Regional Regulations of Bolaang Mongondow Regency, built for Satpol PP.',
    'Traffic analytics: with your consent, we use Google Analytics to count visits and usage anonymously. Your question text is never sent to Google.',
    'Query logging: the questions you ask are stored on our server in anonymised form to understand user needs and improve the service. Before storage we make a best effort to remove obvious personal data (national ID, phone, email, tax ID, and names following a title). This is best-effort and not a guarantee — please avoid entering unnecessary personal data.',
    'Identity: we do not store names, IP addresses, or accounts. Each session gets a random identifier not linked to you.',
    'Retention: query logs are automatically deleted after 90 days.',
    'We do not sell or share this data.',
  ],
};

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = locale === 'en' ? EN : ID;
  return (
    <article style={{ maxWidth: '68ch', margin: '0 auto', padding: '3rem 1.25rem' }}>
      <h1 style={{ fontFamily: 'var(--font-newsreader), serif', marginBottom: '1.5rem' }}>
        {t.title}
      </h1>
      {t.body.map((p, i) => (
        <p key={i} style={{ marginBottom: '1rem', lineHeight: 1.6 }}>
          {p}
        </p>
      ))}
    </article>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd apps/web && npm run dev`. Visit `http://localhost:3000/privasi` and
`http://localhost:3000/en/privasi`. Expected: Indonesian and English render;
the consent bar's "Kebijakan Privasi" link reaches it.

- [ ] **Step 3: Build**

Run: `cd apps/web && npm run build`
Expected: `/[locale]/privasi` in the route list, compiles clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/privasi/page.tsx
git commit -m "feat: add privacy policy page"
```

---

## Self-Review

**1. Spec coverage:**
- GA4 consent-gated, env var, root layout → Task 5 ✓
- CSP update → Task 5 Step 2 ✓
- `chat_submitted` count event → Task 5 Step 5 ✓
- Consent bar + copy → Task 5 Step 3 ✓
- Privacy page (id/en) → Task 6 ✓
- `chat_logs` table + exact fields + RLS → Task 2 ✓
- 90-day retention (pg_cron + Vercel Cron fallback) → Task 2 / Task 2b ✓
- PII scrub module + patterns + exclusions → Task 1 ✓
- `chat-log.ts` builder + writer + salted hash + never-throws → Task 3 ✓
- `waitUntil` wiring in route → Task 4 Steps 2–4 ✓
- Frontend sessionId in body → Task 4 Step 6 ✓
- Testing / done criteria → per-task manual + `npm run test` in Tasks 4, 5 ✓
- Env docs (`NEXT_PUBLIC_GA_ID`, `CHAT_LOG_SALT`, `CRON_SECRET`) → Tasks 5, 3, 2b ✓

Gap found and fixed: `CHAT_LOG_SALT` needs an explicit `.env` documentation step —
added to Task 3 Step 6 below. (See amendment.)

**2. Placeholder scan:** No TBD/TODO. All code steps contain full code. "Add appropriate
error handling" not used — error paths are spelled out (try/catch + `console.warn`).

**3. Type consistency:** `scrubPii` returns `{ text, scrubbed }` — consumed correctly in
`buildChatLogRow`. `ChatLogInput` fields (`query`, `refinedQuery`, `responseState`,
`sessionId`) match the call site in Task 4 Step 4. `logChatQuery` signature matches.
`vp-session-id` (sessionStorage) and `vp-analytics-consent` (localStorage) key names
consistent across Tasks 4–5.

### Amendment to Task 3 — add Step 6 (renumber commit to Step 7)

- [ ] **Step 6: Document the salt env var**

Add to `apps/web/.env` (and `.env.example` if present):
```
CHAT_LOG_SALT=<generate a random 32+ char string>
```
Also set it in the Vercel project env vars. If unset, logging still works but
`session_hash` is stored as `null` (multi-turn sessions can't be grouped).
