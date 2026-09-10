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
