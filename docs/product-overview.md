# Vector Pasal — Product Overview

## What It Is

Vector Pasal is an AI-powered legal assistant (chatbot) built for **Satuan Polisi Pamong Praja (Satpol PP) Kabupaten Bolaang Mongondow**, Sulawesi Utara. It answers questions about local regulations by searching a curated corpus of Peraturan Daerah (Perda) and Peraturan Bupati (Perbup) using hybrid retrieval (vector search + full-text search + trigram matching), then generating a grounded answer with source citations via Google Gemini.

The system is designed so that **every answer traces back to a specific Pasal** in a specific regulation. It does not guess or invent legal rules — if the answer isn't in the corpus, the chatbot says so.

## Who It's For

- **Satpol PP field officers** — quick lookup of enforcement rules, sanctions, tariffs, and procedures during operations.
- **Satpol PP administrative staff** — reference for penalty amounts, reporting obligations, procedural requirements.
- **Regional government staff (Bolmong)** — general legal reference for local regulations covering tax, civil service conduct, CSR, e-government, agriculture, and poverty reduction.

## What It Can Answer

The chatbot handles questions in **Bahasa Indonesia** about:

- **Pajak & Retribusi** — tax rates, tariff schedules, calculation methods, sanctions for non-compliance (Perda 1/2024, Perbup 19/2024, Perbup 8/2025, Perbup 22/2022)
- **Ketertiban umum (Trantibum)** — public order rules, prohibitions, administrative sanctions (Perda 3/2023)
- **Narkotika** — obligations for hotel/entertainment venue owners, prevention duties, sanctions (Perda 6/2025)
- **Kepegawaian (ASN)** — civil service code of ethics, disciplinary sanctions, TPP rules, merit system, career development (Perbup 15/2023, Perbup 22/2025, Perbup 29/2024)
- **Bantuan hukum** — free legal aid eligibility, application procedures, provider obligations (Perda 1/2021)
- **Penanggulangan kemiskinan** — poverty reduction programs, rights of the poor, government obligations (Perda 5/2024)
- **Pertanian & Perikanan** — farmer/fisher protection, agricultural insurance, disaster relief (Perda 7/2025)
- **CSR (Tanggung Jawab Sosial)** — corporate social responsibility program areas, forum structure (Perbup 12/2025)
- **E-Government (SPBE)** — electronic government system governance, application coordination requirements, data management (Perbup 14/2025)

## What It Cannot Answer

- Regulations **not in the corpus** — national laws (UU), provincial regulations (Perda Prov), ministerial regulations, or Bolmong regulations not yet ingested.
- **Legal advice** — the chatbot provides information about what the regulation says, not legal opinions or case strategy.
- **Court decisions or jurisprudence** — only statutory text is in the corpus.
- **Historical/repealed content as if it were current** — the validity layer actively suppresses repealed regulations from answers.

## Key Design Principles

1. **Grounded answers only** — every claim must cite a Pasal. The system prompt instructs Gemini to refuse if the answer isn't in the retrieved context.
2. **Validity is deterministic, not AI-inferred** — whether a regulation is live, repealed, or amended is determined by `work_relationships` edges, never by the LLM.
3. **Indonesian-first** — the chatbot operates in Bahasa Indonesia. The interface supports English but the legal corpus is Indonesian.
4. **Fail visible** — if retrieval returns nothing relevant, the chatbot says so rather than hallucinating.
