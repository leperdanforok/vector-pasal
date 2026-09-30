# Corpus Coverage

Last updated: 2026-09-30

## Summary

| Metric | Count |
|--------|-------|
| Total regulations | 16 (excluding 1 duplicate pending cleanup) |
| Peraturan Daerah (Perda) | 8 |
| Peraturan Bupati (Perbup) | 8 |
| Total document nodes | 2,688 |
| Validity relationships | 5 edges |

## Peraturan Daerah (PERDA_KAB)

| No | Year | Tentang | Nodes | Domain | Notes |
|----|------|---------|-------|--------|-------|
| 4 | 2020 | Retribusi Parkir Jalan | 9 | Retribusi | **Dicabut** oleh Perda 1/2024. Kept in corpus with repealed status for validity regression testing. |
| 2 | 2021 | Pajak Sarang Burung Walet | 186 | Pajak | **Dicabut** oleh Perda 1/2024. Same as above. |
| 1 | 2021 | Penyelenggaraan Bantuan Hukum | 105 | Bantuan hukum | Prosedur permohonan, syarat penerima, hak/kewajiban pemberi & penerima bantuan hukum. |
| 3 | 2023 | Ketertiban Umum dan Ketenteraman Masyarakat (Trantibum) | 178 | Trantibum | Core Satpol PP regulation. Prohibitions, sanctions, enforcement procedures. |
| 1 | 2024 | Pajak Daerah dan Retribusi Daerah | 662 | Pajak & Retribusi | **Largest regulation.** Consolidates all local taxes and fees. Includes Lampiran tarif tables. Repeals Perda 4/2020 and Perda 2/2021. |
| 5 | 2024 | Penanggulangan Kemiskinan | 106 | Sosial | Poverty reduction strategy, rights, TKPKD coordination. |
| 6 | 2025 | Pencegahan dan Pemberantasan Penyalahgunaan dan Peredaran Gelap Narkotika | 241 | Narkotika | Hotel/entertainment venue obligations, community participation, sanctions. |
| 7 | 2025 | Perlindungan dan Pemberdayaan Petani, Nelayan, dan Pembudi Daya Ikan | 303 | Pertanian & Perikanan | Farmer/fisher protection, agricultural insurance, climate risk. |

## Peraturan Bupati (PERBUP_KAB)

| No | Year | Tentang | Nodes | Domain | Notes |
|----|------|---------|-------|--------|-------|
| 22 | 2022 | Harga Standar Pengambilan Mineral Bukan Logam dan Batuan | 11 | Pajak MBLB | Tarif 20% dari harga standar. Mencabut Perbup 30/2018. |
| 15 | 2023 | Kode Etik Pegawai ASN | 67 | Kepegawaian | Sanksi moral, hukuman disiplin ringan/sedang/berat, Majelis Kode Etik. |
| 19 | 2024 | Perhitungan Nilai Sewa Reklame | 41 | Pajak Reklame | NSR formula, tarif 25%, harga satuan per jenis reklame (billboard, spanduk, videotron, dll). |
| 29 | 2024 | Sistem Merit dalam Manajemen PNS | 321 | Kepegawaian | Career development, promotions, competency assessment, talent management. |
| 12 | 2025 | Pelaksanaan Perda 12/2023 tentang Tanggung Jawab Sosial dan Lingkungan Badan Usaha | 47 | CSR | 8 program areas, forum structure, pelaksanaan. |
| 14 | 2025 | Tata Kelola Sistem Pemerintahan Berbasis Elektronik (SPBE) | 315 | E-Government | Architecture, data management, application coordination, security. |
| 22 | 2025 | Perubahan Kedua atas Perbup 3/2022 tentang TPP ASN | 20 | Kepegawaian | TPP discipline scoring, pemotongan 50%/35% for missed ceremonies, Plt +20% rules. |
| 8 | 2025 | Pemungutan Opsen Pajak MBLB | 38 | Pajak MBLB | Opsen rate 25%, payment/reporting procedures, reconciliation. |

## Validity Relationships

The following repeal/amend edges are active in `work_relationships`:

| Source | Target | Type |
|--------|--------|------|
| Perda 1/2024 | Perda 2/2021 (Walet) | Mencabut (repeals) |
| Perda 2/2021 | Perda 1/2024 | Dicabut oleh (repealed by) |
| Perda 1/2024 | Perda 4/2020 (Parkir) | Mencabut (repeals) |
| Perda 4/2020 | Perda 1/2024 | Dicabut oleh (repealed by) |
| Perda 4/2020 | Perda 6/2011 (out-of-coverage) | Mencabut (repeals) |

## Known Issues

- **Duplicate entry (work id 21):** The file `PERBUP NO 7 TAHUN 2025 - PENILAIAN PAJAK BUMI DAN BANGUNAN...docx` actually contains Perbup 8/2025 (Opsen MBLB) content. This created a duplicate in Supabase. Pending cleanup — run the SQL in the cleanup notes. The real Perbup 7/2025 (PBB-P2) is **not yet in the corpus**.
- **Validity edges not yet mapped for new ingestions:** The Perbup batch (2026-09-30) and new Perda (1/2021, 5/2024, 7/2025) have not had their Ketentuan Penutup checked for repeal/amend relations. This is Step 2 of the Ingestion Definition of Done.

## Regulations Known But Not Yet Ingested

The following have been identified as relevant but are not in the corpus:

- Perbup 7/2025 — Penilaian PBB-P2 (source DOCX was mislabeled)
- Perda 12/2023 — Tanggung Jawab Sosial dan Lingkungan Badan Usaha (parent Perda for Perbup 12/2025)
- Perbup 3/2022 — TPP ASN (base regulation, amended by Perbup 1/2023 and Perbup 22/2025)
- Perbup 1/2023 — Perubahan Pertama atas Perbup 3/2022 tentang TPP ASN
