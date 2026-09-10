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
