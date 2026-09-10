import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';

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
  setRequestLocale(locale as Locale);
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
