'use client';

/**
 * Dev-only preview of every validity-state treatment. Not linked from the app.
 *
 * LIVE-VERIFIED fixtures are the real frame captured from POST "Berapa tarif parkir?" during the
 * Day-2 session (content read directly from document_nodes ids 2287/2311/990/1013/961 — a stored-text
 * read, not a re-POST). MOCK-TESTED fixtures are hand-authored because no corpus data exercises them.
 *
 * Visit: /dev/validity-states
 */
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { VPSourceCard } from '@/components/validity/SourceCard';
import { ValidityNotice } from '@/components/validity/ValidityNotice';
import { DocumentModal } from '@/components/validity/DocumentModal';
import type { Source } from '@/lib/validity-ui';

const REPEALED_BY = { successorWorkId: 3, number: '1', year: 2024, label: 'Perda No 1/2024' };

// ---- LIVE-VERIFIED: captured parkir frame (1/2024 live heroes + repealed walet 2/2021 demoted) ----
const LIVE_HEROES: Source[] = [
  {
    role: 'hero',
    validity: { state: 'live' },
    metadata: { type: 'PERDA_KAB', number: '1', year: '2024', pasal: 'I.54', node_type: 'lampiran_tarif' },
    content:
      'B. PELAYANAN PARKIR DI TEPI JALANAN UMUM\n' +
      'STRUKTUR DAN BESARAN TARIF RETRIBUSI ATAS PELAYANAN PARKIR DI TEPI JALANAN UMUM\n\n' +
      '| NO | JENIS KENDARAAN | TARIF |\n| :--- | :--- | :--- |\n' +
      '| 1 | RODA 2 (DUA) | Rp2.000/PARKIR |\n| 2 | RODA 3 (TIGA) | Rp2.000/PARKIR |\n' +
      '| 3 | RODA 4 (EMPAT) | Rp4.000/PARKIR |\n| 4 | RODA 6 (ENAM) KE ATAS | Rp8.000/PARKIR |',
  },
  {
    role: 'hero',
    validity: { state: 'live' },
    metadata: { type: 'PERDA_KAB', number: '1', year: '2024', pasal: 'II.13', node_type: 'lampiran_tarif' },
    content:
      '7. PEMANFAATAN ASET DAERAH PADA DINAS PARIWISATA DI TEMPAT REKREASI, PARIWISATA, DAN OLAH RAGA\n' +
      '| NO. | STRUKTUR RETRIBUSI | TARIF | Keterangan |\n| :-- | :--- | :--- | :--- |\n' +
      '| 2 | Parkir Kendaraan Roda 4 | Rp4.000 | per kendaraan |\n' +
      '| 3 | Parkir Kendaraan Roda 2 | Rp2.000 | per kendaraan |',
  },
];

const DEMOTED: Source[] = [
  {
    role: 'demoted',
    validity: { state: 'repealed_with_successor', repealedBy: REPEALED_BY },
    metadata: { type: 'PERDA_KAB', number: '2', year: '2021', pasal: '9', node_type: 'pasal' },
    content:
      'Masa Pajak Sarang Burung Walet merupakan jangka waktu yang lamanya 1 (satu) bulan kalender yang ' +
      'menjadi dasar bagi Wajib Pajak untuk menghitung, menyetor, dan melaporkan pajak yang terutang.',
  },
  {
    role: 'demoted',
    validity: { state: 'repealed_with_successor', repealedBy: REPEALED_BY },
    metadata: { type: 'PERDA_KAB', number: '2', year: '2021', pasal: '32', node_type: 'pasal' },
    content:
      '(1) Pejabat Pegawai Negeri Sipil tertentu di lingkungan pemerintah daerah diberi wewenang khusus ' +
      'sebagai penyidik untuk melakukan penyidikan dibidang perpajakan daerah, sebagaimana dimaksud dalam ' +
      'Undang-Undang Hukum Acara Pidana.',
  },
];

// ---- MOCK-TESTED: no corpus data exercises these ----
const MOCK_GATED: Source = {
  role: 'hero',
  validity: { state: 'repealed_no_successor', repealedBy: { number: '?', year: 0, label: 'peraturan yang lebih baru' } },
  metadata: { type: 'PERDA_KAB', number: '5', year: '2015', pasal: '12', node_type: 'pasal' },
  content:
    '(MOCK) Setiap pemilik usaha wajib memungut retribusi sebesar Rp1.500 per dokumen. Ketentuan ini ' +
    'telah dicabut tanpa pengganti yang tersedia di basis data.',
};

function Tag({ kind }: { kind: 'LIVE-VERIFIED' | 'MOCK-TESTED' }) {
  const live = kind === 'LIVE-VERIFIED';
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', padding: '2px 8px',
        borderRadius: 999, border: '1px solid',
        color: live ? 'var(--vp-primary)' : 'var(--vp-warning)',
        borderColor: live ? 'var(--vp-primary)' : 'var(--vp-warning)',
        background: live ? 'var(--vp-primary-light)' : 'color-mix(in srgb, var(--vp-warning) 12%, transparent)',
      }}
    >
      {kind}
    </span>
  );
}

function Section({ title, kind, children }: { title: string; kind: 'LIVE-VERIFIED' | 'MOCK-TESTED'; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--vp-text)', margin: 0 }}>{title}</h2>
        <Tag kind={kind} />
      </div>
      {children}
    </section>
  );
}

export default function ValidityStatesPreview() {
  const [doc, setDoc] = useState<Source | null>(null);
  const [dark, setDark] = useState(false);
  const toggleDark = () => {
    document.documentElement.classList.toggle('dark');
    setDark((d) => !d);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vp-bg)', color: 'var(--vp-text)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Validity-state treatments</h1>
          <button
            type="button"
            onClick={toggleDark}
            className="vp-source-btn"
            style={{ border: '1px solid var(--vp-border)', borderRadius: 8, padding: '6px 10px' }}
          >
            <Icon name={dark ? 'sun' : 'moon'} size={14} /> {dark ? 'Light' : 'Dark'}
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--vp-text-secondary)', marginTop: 0, marginBottom: 28 }}>
          Dev preview · consumes the <code>source.validity</code> contract. Click <strong>Buka Dokumen</strong> on a
          demoted card to confirm the modal collapses the dead text and suppresses <strong>Salin</strong>.
        </p>

        <Section title="live" kind="LIVE-VERIFIED">
          {LIVE_HEROES.map((s, i) => (
            <VPSourceCard key={i} source={s} onViewFull={setDoc} />
          ))}
        </Section>

        <Section title="repealed_with_successor (demoted)" kind="LIVE-VERIFIED">
          <p style={{ fontSize: 11.5, color: 'var(--vp-text-dim)', marginTop: -4, marginBottom: 10 }}>
            Note: these are walet 2/2021 refs surfacing under a parkir answer (both repealed by 1/2024) — the
            known off-topic-demotion wart. The treatment should read them as &ldquo;related repealed
            regulation&rdquo;, not answer content.
          </p>
          {DEMOTED.map((s, i) => (
            <VPSourceCard key={i} source={s} onViewFull={setDoc} />
          ))}
        </Section>

        <Section title="repealed_no_successor (gated)" kind="MOCK-TESTED">
          <VPSourceCard source={MOCK_GATED} onViewFull={setDoc} />
        </Section>

        <Section title="out_of_coverage" kind="MOCK-TESTED">
          <ValidityNotice state="out_of_coverage" />
        </Section>

        <Section title="successor_unretrieved" kind="MOCK-TESTED">
          <ValidityNotice state="successor_unretrieved" />
        </Section>
      </div>

      {doc && <DocumentModal source={doc} onClose={() => setDoc(null)} />}
    </div>
  );
}
