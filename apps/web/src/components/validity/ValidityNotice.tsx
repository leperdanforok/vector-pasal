'use client';

/**
 * Card-less, response-level validity notice. Used for the two states that have NO source:
 *   - out_of_coverage       : a relevant regulation is known but absent from the corpus
 *   - successor_unretrieved : a repealed rule's live successor exists but its article wasn't retrieved
 * Both point the officer to Bagian Hukum and carry NO dead content. No gate.
 *
 * In the live chat these are not wired (the route signals them via text only, with no machine-readable
 * frame — out of scope to change). This component is exercised in the /dev preview against mock
 * fixtures and is ready for the route to drive once it emits a state signal.
 */
import { Icon } from '../Icon';
import { validityPresentation } from '@/lib/validity-ui';
import type { ValidityState } from '@/lib/validity';

const DEFAULT_MESSAGE: Partial<Record<ValidityState, string>> = {
  out_of_coverage:
    'Aturan yang berkaitan dengan pertanyaan ini diketahui ada, namun belum tersedia di basis data Vector Pasal. Mohon verifikasi langsung dengan Bagian Hukum Kabupaten Bolaang Mongondow.',
  successor_unretrieved:
    'Aturan yang Anda tanyakan sudah diperbarui, namun teks pasal penggantinya belum dapat ditampilkan untuk pertanyaan ini. Mohon verifikasi langsung dengan Bagian Hukum Kabupaten Bolaang Mongondow.',
};

export function ValidityNotice({ state, message }: { state: ValidityState; message?: string }) {
  const p = validityPresentation(state);
  return (
    <div className={`vp-validity-notice vp-validity--${p.tone}`}>
      <span className="vp-validity-notice-head">
        <Icon name={p.icon} size={15} strokeWidth={2} />
        {p.label}
      </span>
      <p className="vp-validity-notice-text">{message ?? DEFAULT_MESSAGE[state] ?? ''}</p>
      <span className="vp-validity-notice-foot">
        <Icon name="building" size={12} />
        Bagian Hukum Kabupaten Bolaang Mongondow
      </span>
    </div>
  );
}
