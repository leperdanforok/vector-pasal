# Gold-set regression harness

A small, deliberately-run regression suite that drives the **real** chat pipeline
(`POST /api/chat`) against known-correct legal answers, so future changes can't silently
regress validity behavior (e.g. serving a repealed Perda or a dead tariff).

It is **opt-in** — it is NOT part of `npm run test` (that suite stays fast, offline, deterministic).

## Run it

```bash
# 1. Start the app (another terminal), or point at a deployed instance:
npm run dev
#    or: export GOLD_BASE_URL=https://vector-pasal.vercel.app

# 2. Run the gold set:
npm run test:gold
```

`GOLD_BASE_URL` defaults to `http://localhost:3000`. The runner makes real Gemini calls, so each
run costs API quota — run it deliberately, not on every commit.

## What each case asserts

For every case in [`cases.ts`](./cases.ts):

1. **Safety (`must_not_contain`)** — always runs. Fails loud if any forbidden string/regex
   appears in the streamed answer (e.g. a dead Perda 4/2020 flat parking tariff).
2. **Ground truth (`expected.*`)** — runs only when filled in. The answer's `sources` frame must
   contain the expected `work` + `pasal`, tagged with the expected `validity_state`.

## Filling in the truth — `TODO(viddie)`

**Every `expected.*` value is legal ground truth YOU author by reading the Perda.** Do not let
anyone (human or AI) infer it from the corpus. Until you confirm a value it stays `TODO(viddie)`,
and the runner **skips** that case's ground-truth assertion and lists it via an `afterAll` warning
(so it is visible, never silently green).

To author a case: read the live Perda, then set `expected.work` (as `"number/year"`),
`expected.pasal`, and `expected.validity_state` (usually `"live"`). Add `must_not_contain` entries
if a specific repealed figure must never surface.

### Currently confirmed vs pending
- ✅ `walet-tarif` → 1/2024 Pasal 56 (live)
- ✅ `narkotika-hotel` → 6/2025 Pasal 25 (live)
- ✅ `parkir-tarif` → `must_not_contain` dead-tariff regexes (tested — see below). `expected.*` still TODO.
- ⏳ `sptpd-sanksi` → all `expected.*` TODO.

## Regex validation (`must_not_contain` for parkir)

Perda 4/2020 Pasal 8 renders tariffs **bare** as `2000/parkir`, `4000/parkir`, `8000/parkir`
(no "Rp", no thousands dot), so a naive `Rp\s?[2-8]\.000` would match none of them. The two
patterns used were tested against real corpus + live-work strings:

- `re:(?<![\d])[248]000\s*/\s*parkir` — the bare corpus form
- `re:(?<![\d])[248]\.000(?!\s?[.\d])` — reformatted `Rp2.000`/`2.000` of exactly 2/4/8-thousand,
  **excluding** millions (`Rp2.000.000`, `Rp20.000.000`, `Rp80.000.000`, …) via the lookahead

Verified: all dead-tariff forms flag; `Rp1.000.000` / `Rp3.000.000` / `Rp10.000.000,00` /
`Rp80.000.000,00` / `Rp300.000.000,00`, health `150.000`, the `Rp20.000.000` fine, and years
(`2009`, `2020`) all stay clean. Extend the cases if a new tariff rendering appears.
