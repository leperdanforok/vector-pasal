# User Guide

## Asking Questions

Type your question in **Bahasa Indonesia** into the chat box on the homepage. The chatbot works best when your question is specific.

### Good questions (specific, answerable from the corpus)

| Question | Why it works |
|----------|-------------|
| Berapa tarif pajak sarang burung walet? | Asks for a specific number from a specific tax |
| Apa sanksi jika tidak melaporkan SPTPD? | Asks for a specific legal consequence |
| Apa syarat untuk mendapatkan bantuan hukum gratis? | Asks for a specific list of requirements |
| Berapa pemotongan TPP ASN jika tidak ikut upacara? | Asks for a specific percentage from a specific rule |
| Apa kewajiban pemilik hotel terkait narkotika? | Asks about obligations for a specific party |
| Berapa tarif pajak reklame billboard? | Asks for a tariff from a specific regulation |

### Less effective questions

| Question | Problem |
|----------|---------|
| Apa isi Perda 1/2024? | Too broad — the regulation has 120+ Pasals |
| Bagaimana hukum di Bolmong? | Too vague — no specific topic |
| Apakah saya bisa dipenjara? | Missing context — for what offense? |

### Tips

- **Be specific about the topic** — "tarif parkir" is better than "retribusi"
- **Include the type of information you need** — "sanksi", "tarif", "syarat", "kewajiban", "prosedur"
- **You can ask follow-up questions** — each message is independent but the chatbot handles context
- **Typos are OK** — the system uses fuzzy matching and will still find relevant results

## Understanding the Answer

Each answer includes:

1. **The response text** — in Bahasa Indonesia, citing specific Pasal numbers in brackets like `[Perda 1/2024, Pasal 56]`
2. **Source cards** — at the bottom, showing which regulations and Pasals were used. Each card shows:
   - The regulation name and number
   - The specific Pasal
   - A validity badge (if the regulation has been repealed or amended)

### Validity Badges

| Badge | Meaning |
|-------|---------|
| **Berlaku** (Live) | This regulation is currently in force |
| **Dicabut** (Repealed) | This regulation has been replaced by a newer one. The answer should come from the replacement, not this one. |
| **Diubah** (Amended) | This regulation has been partially changed. Check the amending regulation for updated provisions. |

## What Regulations Are Available

The chatbot currently covers **16 regulations** specific to Kabupaten Bolaang Mongondow:

### Peraturan Daerah (Perda)

- Perda 1/2024 — Pajak Daerah dan Retribusi Daerah (consolidated tax & fees)
- Perda 3/2023 — Ketertiban Umum dan Ketenteraman Masyarakat
- Perda 6/2025 — Pencegahan Penyalahgunaan Narkotika
- Perda 7/2025 — Perlindungan Petani, Nelayan, dan Pembudi Daya Ikan
- Perda 1/2021 — Penyelenggaraan Bantuan Hukum
- Perda 5/2024 — Penanggulangan Kemiskinan
- Perda 4/2020 — Retribusi Parkir *(dicabut oleh Perda 1/2024)*
- Perda 2/2021 — Pajak Sarang Burung Walet *(dicabut oleh Perda 1/2024)*

### Peraturan Bupati (Perbup)

- Perbup 19/2024 — Perhitungan Nilai Sewa Reklame
- Perbup 8/2025 — Opsen Pajak Mineral Bukan Logam dan Batuan
- Perbup 22/2022 — Harga Standar Mineral Bukan Logam dan Batuan
- Perbup 15/2023 — Kode Etik Pegawai ASN
- Perbup 29/2024 — Sistem Merit dalam Manajemen PNS
- Perbup 22/2025 — TPP ASN (Perubahan Kedua)
- Perbup 12/2025 — Tanggung Jawab Sosial dan Lingkungan Badan Usaha
- Perbup 14/2025 — Tata Kelola SPBE (e-Government)

If your question is about a regulation **not in this list**, the chatbot will tell you it cannot find relevant information. This is by design — it will not guess or fabricate answers.

## Language

The chatbot operates primarily in **Bahasa Indonesia**. The web interface also supports English (accessible via `/en/` URLs), but the legal content and answers remain in Indonesian since the source regulations are in Indonesian.
