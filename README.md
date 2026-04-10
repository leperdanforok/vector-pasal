# Vector Pasal (VP) 

**Asisten AI Perda Satpol PP Kabupaten Bolaang Mongondow**

Vector Pasal (VP) adalah platform asisten hukum berbasis AI yang dirancang khusus untuk membantu petugas Satpol PP di Kabupaten Bolaang Mongondow. Aplikasi ini memberikan akses cepat ke database Peraturan Daerah (Perda) menggunakan teknologi RAG (Retrieval-Augmented Generation) untuk memastikan jawaban yang diberikan akurat dan memiliki dasar hukum yang jelas.

##  Fitur Utama
- **Chatbot AI Grounded**: Memberikan jawaban berdasarkan dokumen Perda resmi tanpa halusinasi.
- **Referensi Pasal**: Menampilkan sumber hukum asli untuk setiap jawaban yang diberikan.
- **PWA (Progressive Web App)**: Dapat diinstal di HP Android/iOS untuk penggunaan cepat di lapangan.
- **Salin & Bagikan**: Memudahkan petugas menyalin teks pasal ke laporan WhatsApp atau membagikan referensi hukum secara instan.
- **Mode Gelap/Terang**: Antarmuka yang nyaman untuk penggunaan siang hari maupun patroli malam.

##  Tech Stack
- **Frontend**: Next.js 15 (App Router)
- **Database**: Supabase (PostgreSQL + pgvector)
- **AI Model**: Google Gemini 1.5 Flash
- **Styling**: Tailwind CSS & Shadcn UI
- **Deployment**: Vercel

##  Struktur Proyek
Proyek ini dikembangkan sebagai monorepo:
- `apps/web`: Aplikasi web utama (Next.js)
- `scripts/`: Skrip Python untuk pemrosesan dokumen dan upload data ke Supabase.
- `packages/supabase`: Migrasi database dan skema tabel.

##  Pengembang
Dikembangkan oleh **Viddie Pilat**.

---
*Proyek ini dibangun di atas fondasi open-source [pasal.id](https://pasal.id).*