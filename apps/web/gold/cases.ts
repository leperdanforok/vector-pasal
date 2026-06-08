/**
 * Gold-set regression cases for the chat retrieval + validity pipeline.
 *
 * HARD RULE: every `expected.*` value is LEGAL GROUND TRUTH the maintainer fills in by reading
 * the Perda. Do NOT infer, guess, or auto-populate from the corpus. Unconfirmed values stay
 * `TODO(viddie)` — the runner skips their ground-truth assertions (but still runs the safety
 * `must_not_contain` checks).
 *
 * See ./README.md for how to fill these in and how to run the suite.
 */
import type { ValidityState } from '../src/lib/validity';

/** Sentinel for legal ground truth the maintainer must author. Never auto-populated. */
export const TODO = 'TODO(viddie)' as const;
export type Todo = typeof TODO;

export type GoldExpectation = {
  /** Perda the LIVE answer should cite, as "number/year", e.g. "1/2024". */
  work: string | Todo;
  /** Pasal number the live answer should cite, e.g. "56". */
  pasal: string | Todo;
  /** Validity state that the cited source must carry, e.g. "live". */
  validity_state: ValidityState | Todo;
};

export type GoldCase = {
  /** Stable slug used as the test name. */
  id: string;
  /** The user question, exactly as typed into the chat. */
  query: string;
  /** Ground truth — stays TODO(viddie) until the maintainer confirms it from the Perda. */
  expected: GoldExpectation;
  /**
   * Substrings that must NEVER appear in the streamed answer (the safety check — fails loud).
   * Each entry is a plain substring, or "re:<regex>" for precision (e.g. dead flat tariffs
   * without matching million-rupiah figures). A sole element of TODO means "not yet authored".
   */
  must_not_contain: (string | Todo)[];
  /** What this case verifies, in plain language (also printed on failure). */
  note: string;
};

export const goldCases: GoldCase[] = [
  {
    id: 'walet-tarif',
    query: 'Berapa tarif pajak sarang burung walet?',
    expected: { work: '1/2024', pasal: '56', validity_state: 'live' }, // CONFIRMED 2026-06-04
    must_not_contain: [TODO],
    note: 'Walet tariff (10%) must come from LIVE Perda 1/2024 Pasal 56. Repealed Perda 2/2021 may only appear as a demoted repealed_with_successor reference, never as the cited answer.',
  },
  {
    id: 'sptpd-sanksi',
    query: 'Apa sanksi jika tidak melaporkan SPTPD?',
    expected: { work: TODO, pasal: TODO, validity_state: TODO },
    must_not_contain: [TODO],
    note: 'SPTPD sanction must come from the LIVE consolidated tax law Perda 1/2024 — NOT repealed 2/2021 Pasal 33. TODO(viddie): read Perda 1/2024, fill the exact live Pasal (state="live"); add must_not_contain entries if a specific repealed figure must never surface.',
  },
  {
    id: 'parkir-tarif',
    query: 'Bagaimana retribusi parkir dihitung?',
    expected: { work: TODO, pasal: TODO, validity_state: TODO },
    // CONFIRMED + TESTED against real corpus strings (see ./README.md "Regex validation").
    // Perda 4/2020 Pasal 8 renders tariffs BARE as "2000/parkir" | "4000/parkir" | "8000/parkir"
    // (no "Rp", no thousands dot). p1 catches that bare form; p2 catches reformatted
    // "Rp2.000"/"2.000" of exactly 2/4/8-thousand while EXCLUDING millions (Rp2.000.000,
    // Rp20.000.000, Rp80.000.000 …) via the negative lookahead.
    must_not_contain: [
      're:(?<![\\d])[248]000\\s*/\\s*parkir',
      're:(?<![\\d])[248]\\.000(?!\\s?[.\\d])',
    ],
    note: 'Live answer must come from Perda 1/2024 (PBJT/retribusi). Must NEVER return Perda 4/2020 flat parking tariffs (2000/4000/8000 per parkir). TODO(viddie): fill expected.work/pasal/validity_state from the live 1/2024 parking provision after reading the Perda.',
  },
  {
    id: 'narkotika-hotel',
    query: 'Apa kewajiban pemilik hotel terkait narkotika?',
    expected: { work: '6/2025', pasal: '25', validity_state: 'live' }, // CONFIRMED (unchanged)
    must_not_contain: [],
    note: 'Live obligation from Perda 6/2025 Pasal 25 (not repealed; unchanged by the validity work).',
  },
];
