/**
 * Gold-set regression runner. Opt-in only (not part of `npm run test`):
 *
 *   npm run dev                       # in another terminal, or set GOLD_BASE_URL
 *   npm run test:gold
 *
 * For each case it (1) ALWAYS runs the `must_not_contain` safety checks against the real answer
 * (fails loud if a forbidden string appears), then (2) runs the ground-truth assertions only
 * when the maintainer has filled them in — unfilled cases are listed by `afterAll` so they stay
 * visible instead of silently green.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { goldCases, TODO } from './cases';
import { runCaseWithRetry, UpstreamUnavailableError } from './runner';

const BASE = process.env.GOLD_BASE_URL ?? 'http://localhost:3000';
const isTodo = (v: unknown): v is typeof TODO => v === TODO;
const pending: string[] = [];

describe(`gold set @ ${BASE}`, () => {
  beforeAll(async () => {
    // GET on the POST-only route should be 405 when the server is up and the route is registered.
    const ok = await fetch(`${BASE}/api/chat`)
      .then((r) => r.status === 405)
      .catch(() => false);
    if (!ok) {
      throw new Error(
        `No reachable /api/chat at ${BASE}. Start the app ("npm run dev") or set GOLD_BASE_URL ` +
          `to a deployed URL.`,
      );
    }
  });

  afterAll(() => {
    if (pending.length) {
      console.warn(
        `\n[gold] ground truth still TODO(viddie) — fill expected.* in gold/cases.ts: ${pending.join(', ')}`,
      );
    }
  });

  for (const c of goldCases) {
    it(c.id, async (ctx) => {
      // Single request per case (with bounded retries). A persistent upstream failure
      // (e.g. Gemini 503) SKIPs the case — a red gold case must mean a real regression.
      let answerText: string;
      let sources: Awaited<ReturnType<typeof runCaseWithRetry>>['sources'];
      try {
        ({ answerText, sources } = await runCaseWithRetry(BASE, c.query));
      } catch (e) {
        if (e instanceof UpstreamUnavailableError) {
          ctx.skip(`upstream unavailable (transient — re-run later): ${e.message}`);
          return;
        }
        throw e;
      }

      // 1) SAFETY — forbidden strings must never appear in the answer. Fails loud.
      for (const forbidden of c.must_not_contain) {
        if (isTodo(forbidden)) continue;
        const present = forbidden.startsWith('re:')
          ? new RegExp(forbidden.slice(3), 'i').test(answerText)
          : answerText.includes(forbidden);
        expect(
          present,
          `FORBIDDEN string present in answer for "${c.id}": ${forbidden}\n` +
            `${c.note}\n--- answer ---\n${answerText}`,
        ).toBe(false);
      }

      // 2) GROUND TRUTH — only when the maintainer has authored it.
      if (
        isTodo(c.expected.work) ||
        isTodo(c.expected.pasal) ||
        isTodo(c.expected.validity_state)
      ) {
        pending.push(c.id);
        return; // safety already enforced above
      }

      const [num, year] = c.expected.work.split('/');
      const match = sources.find(
        (s) =>
          String(s.metadata?.number) === num &&
          String(s.metadata?.year) === year &&
          String(s.metadata?.pasal) === c.expected.pasal,
      );
      expect(
        match,
        `Expected a source ${c.expected.work} Pasal ${c.expected.pasal} in the answer sources for "${c.id}".`,
      ).toBeTruthy();
      expect(match!.validity?.state).toBe(c.expected.validity_state);
    });
  }
});
