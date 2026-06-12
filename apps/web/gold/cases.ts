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
    expected: { work: '1/2024', pasal: '116', validity_state: 'live' }, // CONFIRMED 2026-06-08 (verified against source scan)
    must_not_contain: ['6 (enam) bulan'], // dead 2/2021 Pasal 33 criminal term; live Pasal 116 uses "1 tahun"/"2 tahun". Use [] if you prefer no guard.
    note: 'SPTPD sanction must come from LIVE Perda 1/2024 Pasal 116 (ketentuan pidana for deliberately failing the SPTPD obligation) — NOT repealed 2/2021 Pasal 33. SOURCE DEFECT: Pasal 116(2) cross-references "Pasal 106 ayat (5)", which does not exist (Pasal 106 is Peninjauan Tarif Retribusi, 3 ayat); the intended reference is Pasal 109 ayat (5). System must surface this as-written, never auto-correct.',
  },
  {
    id: 'parkir-tarif',
    query: 'Bagaimana retribusi parkir dihitung?',
    expected: { work: '1/2024', pasal: '82', validity_state: 'live' }, // CONFIRMED 2026-06-08
    // SAFETY MODEL CHANGED 2026-06-12 (Lampiran re-ingest): the primary dead-tariff guard is now
    // the corpus-agnostic VALIDITY check in gold.test.ts (no hero source may be a repealed work),
    // not a number-string regex. We keep ONLY p1 — Perda 4/2020 Pasal 8's bare form
    // "2000/parkir"|"4000/parkir"|"8000/parkir" (no "Rp", no thousands dot), which is unique to
    // the dead work. The old p2 ("Rp2.000"/"2.000" dotted form) was DROPPED: after the Lampiran
    // re-ingest, LIVE 1/2024 tariff tables use those same dotted forms, so p2 would false-block a
    // legitimate live answer (handoff 2026-06-09/06-11).
    must_not_contain: [
      're:(?<![\\d])[248]000\\s*/\\s*parkir',
    ],
    note: 'Live answer must come from Perda 1/2024 Pasal 82 (Retribusi Jasa Umum — on-street parking measured by vehicle type, location/zone, frequency, duration; actual tariff deferred to Peraturan Bupati). Must NEVER return Perda 4/2020 flat parking tariffs (2000/4000/8000 per parkir) — enforced primarily by the validity hero-guard.',
  },
  {
    id: 'narkotika-hotel',
    query: 'Apa kewajiban pemilik hotel terkait narkotika?',
    expected: { work: '6/2025', pasal: '25', validity_state: 'live' }, // CONFIRMED (unchanged)
    must_not_contain: [],
    note: 'Live obligation from Perda 6/2025 Pasal 25 (not repealed; unchanged by the validity work).',
  },
  {
    id: 'parkir-tarif-lampiran',
    query: 'Berapa tarif parkir?',
    // NEW 2026-06-12: the Lampiran re-ingest made the actual on-street parking tariff TABLE
    // retrievable as a live `lampiran_tarif` node (1/2024 Lampiran I.54, "PELAYANAN PARKIR DI
    // TEPI JALANAN UMUM"). This case targets the NUMBER, distinct from `parkir-tarif` which
    // targets the calculation method (Pasal 82). The Lampiran node's `pasal` is "I.54" (carried
    // in source.metadata; node_type === 'lampiran_tarif').
    expected: { work: '1/2024', pasal: 'I.54', validity_state: 'live' }, // CONFIRMED 2026-06-12 (maintainer read of Lampiran I.54)
    must_not_contain: [
      're:(?<![\\d])[248]000\\s*/\\s*parkir', // dead Perda 4/2020 bare flat-tariff form
    ],
    note: 'Live on-street parking tariff must come from Perda 1/2024 Lampiran I.54. Must NEVER surface Perda 4/2020 flat tariffs (2000/4000/8000 per parkir) — covered structurally by the validity hero-guard.',
  },
];
