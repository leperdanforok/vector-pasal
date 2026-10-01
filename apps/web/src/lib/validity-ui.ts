/**
 * Presentational layer for the legal-validity contract — pure, no JSX.
 *
 * The route attaches `validity` + `role` to every chat source, and `node_type` to its metadata
 * (see apps/web/src/lib/validity.ts and the /api/chat route). This module is the single place
 * that maps a `ValidityState` to its user-facing treatment (label / icon / tone) and renders the
 * source reference labels. UI components consume this; they never re-derive validity.
 *
 * State→source mapping reality (confirmed against validity.ts):
 *   - A per-source validity.state is only ever: live | repealed_with_successor | repealed_no_successor.
 *   - out_of_coverage / successor_unretrieved have NO source — they are response-level notices.
 */
import type { ValidityInfo, ValidityState } from './validity';

export type SourceMetadata = {
  type?: string;
  number?: string | number;
  year?: string | number;
  pasal?: string | number;
  ayat?: string | number;
  /** Day-2: carried by both RPCs. 'lampiran_tarif' nodes are labelled "Lampiran", not "Pasal". */
  node_type?: string;
};

/** A chat source, matching the wire shape the route streams in its `sources` frame. */
export type Source = {
  content: string;
  metadata?: SourceMetadata;
  validity?: ValidityInfo;
  /** Whether this source grounds the answer (`hero`) or is a demoted "older version" reference. */
  role?: 'hero' | 'demoted';
};

export type ValidityTone = 'live' | 'repealed' | 'warning' | 'info';

export type ValidityPresentation = {
  /** Indonesian status word — the non-color signal (a11y: never rely on color alone). */
  label: string;
  /** Icon name (see components/Icon). */
  icon: string;
  /** Maps to a `.vp-validity--{tone}` CSS class / token set. */
  tone: ValidityTone;
};

const PRESENTATION: Record<ValidityState, ValidityPresentation> = {
  live:                    { label: 'Berlaku',        icon: 'check',          tone: 'live' },
  repealed_with_successor: { label: 'Dicabut',        icon: 'alert-triangle', tone: 'repealed' },
  repealed_no_successor:   { label: 'Perhatian',      icon: 'alert-triangle', tone: 'warning' },
  out_of_coverage:         { label: 'Belum tersedia', icon: 'info',           tone: 'info' },
  successor_unretrieved:   { label: 'Belum tersedia', icon: 'info',           tone: 'info' },
};

export function validityPresentation(state: ValidityState | undefined): ValidityPresentation {
  return PRESENTATION[state ?? 'live'] ?? PRESENTATION.live;
}

/** True for the demoted, repealed-but-shown reference whose body (dead law) must stay collapsed. */
export function isDeadSource(source: Pick<Source, 'validity' | 'role'>): boolean {
  return source.role === 'demoted' || source.validity?.state === 'repealed_with_successor';
}

/**
 * Source reference label honouring node_type — mirrors the chat route's header rule so the card
 * and the answer prose agree: a `lampiran_tarif` node ("I.54") reads "Lampiran I.54", not "Pasal".
 */
export function pasalLabel(meta: SourceMetadata | undefined): string {
  const m = meta ?? {};
  const noun = m.node_type === 'lampiran_tarif' ? 'Lampiran' : 'Pasal';
  const ayat = m.ayat ? ` Ayat (${m.ayat})` : '';
  return `${noun} ${m.pasal ?? '?'}${ayat}`;
}

/** "Perda Kab. No. 1/2024" style work reference. */
export function perdaRef(meta: SourceMetadata | undefined): string {
  const m = meta ?? {};
  const type = m.type === 'PERDA_KAB' ? 'Perda Kab.' : (m.type || 'Perda');
  return `${type} No. ${m.number ?? '?'}/${m.year ?? '?'}`;
}
