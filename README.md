# WhatsApp Web UI (Baileys + Next.js)

Aplikasi web client WhatsApp mandiri (*self-hosted*) dengan antarmuka yang menyerupai WhatsApp Web. Dibangun menggunakan **Next.js** di sisi antarmuka, **Baileys** di sisi backend sebagai engine koneksi WhatsApp Web Protocol, **Socket.IO** untuk komunikasi *real-time*, dan **PostgreSQL** + **Prisma ORM** untuk persistensi data pesan, kontak, dan riwayat obrolan.

---

## 🏛️ Arsitektur Sistem

Sistem dirancang dengan pemisahan tegas antara presentation layer (browser) dan connection layer (server):

```
WhatsApp Servers
      │
      │ (WhatsApp Web Protocol / WebSocket)
      ▼
Baileys Service (Backend Server)
  ├── Auth State & Signal Keys (Persistent Storage)
  ├── Prisma Client ──► PostgreSQL Database
  └── Socket.IO Server & REST APIs
      │
      │ (Local REST & WebSocket Events)
      ▼
Next.js Frontend (Browser)
  └── Hanya sebagai antarmuka tampilan (Presentation Layer)
```

> **Prinsip Utama:**
> Server mengelola seluruh sesi, koneksi, enkripsi Signal, dan event Baileys. Browser **tidak pernah** terhubung langsung ke server WhatsApp atau mengimpor library Baileys.

---

## ✨ Fitur Unggulan

### 1. 💬 Obrolan & Pesan Lengkap
- Tampilan obrolan personal dan grup.
- Mendukung berbagai jenis pesan: teks, gambar, video, audio/voice notes, dokumen, dan stiker.
- Mendukung pesan kutipan (*quoted/reply message*).
- Indikator centang status pesan (terkirim, terkirim ke server, dibaca/centang biru).

### 2. 🔄 Tab Status / Story Terpisah
- Tab navigasi khusus untuk melihat pembaruan status WhatsApp.
- Menampilkan identitas pengirim dan waktu status secara jelas.
- Status diurutkan secara kronologis (status terbaru berada di posisi paling bawah).
- Fitur pencarian (*search bar*) khusus pada daftar status.

### 3. 📢 Tab Saluran (Channels / Newsletters)
- Tab khusus untuk memisahkan obrolan pribadi dengan pembaruan dari Saluran/Channel yang diikuti.
- Membaca konten dan pengumuman saluran tanpa mencampuri daftar obrolan utama.

### 4. ✏️ Rename / Custom Alias Chat
- Fitur ganti nama tampilan (*alias*) kontak, grup, atau channel secara lokal.
- Terintegrasi di seluruh tab (Chats, Status, dan Channels).
- Nama alias tersimpan secara persisten di penyimpanan lokal browser (*localStorage*).

### 5. 🛡️ Kontrol Privasi & Kehadiran (Presence Toggles)
- **Toggle Online / Offline**: Pengguna dapat memilih status kehadiran apakah ingin terlihat *"Online"* atau *"Offline/Unavailable"* kapan saja melalui menu titik tiga di sidebar.
- **Toggle Auto Read Receipts (Centang Biru)**: Opsi untuk mematikan atau menyalakan pengiriman tanda centang biru saat Anda membaca pesan. Anda dapat membaca pesan secara rahasia tanpa lawan bicara mengetahuinya.

### 6. 🔔 Notifikasi Cerdas
- Notifikasi suara dan pemberitahuan desktop otomatis disaring:
  - Notifikasi hanya berbunyi untuk pesan masuk obrolan penting.
  - Notifikasi suara dinonaktifkan untuk status update, broadcast, reaksi, dan pesan saluran agar tidak bising.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 15+ (App Router), React 19, TypeScript, Tailwind CSS / Vanilla CSS, Lucide Icons.
- **Backend**: Node.js, Next.js Custom Server (`server.ts` via `tsx`), `@whiskeysockets/baileys`.
- **Realtime**: Socket.IO (Server & Client).
- **Database & ORM**: PostgreSQL & Prisma ORM.
- **Containerization**: Docker & Docker Compose.

---

## 📋 Prasyarat

Sebelum menjalankan proyek, pastikan Anda telah menginstal:
- **Node.js** v20.x atau v22.x LTS
- **npm** (v10+)
- **Docker & Docker Compose** (disarankan untuk database PostgreSQL)

---

## 🚀 Panduan Instalasi & Menjalankan

### Opsi 1: Menjalankan via Docker Compose (Rekomendasi)

Cara termudah dan paling konsisten untuk menjalankan aplikasi beserta database PostgreSQL:

1. **Clone repository:**
   ```bash
   git clone <repo-url>
   cd whatsapp_UI_baileys
   ```

2. **Siapkan konfigurasi environment:**
   Sesuaikan file `.env.dockhand` atau buat file `.env`:
   ```bash
   cp .env.example .env
   ```

3. **Jalankan container dengan Docker Compose:**
   ```bash
   docker compose up -d --build
   ```

4. **Akses Aplikasi:**
   Buka browser di `http://localhost:3321` (atau port yang dikonfigurasikan pada `docker-compose.yml`).

---

### Opsi 2: Menjalankan di Lingkungan Lokal (Development)

1. **Clone repository dan install dependencies:**
   ```bash
   git clone <repo-url>
   cd whatsapp_UI_baileys
   npm install
   ```

2. **Jalankan Database PostgreSQL:**
   Anda dapat menyalakan container PostgreSQL saja menggunakan docker-compose:
   ```bash
   docker compose up -d db
   ```
   Atau gunakan instance PostgreSQL lokal Anda sendiri.

3. **Konfigurasi Environment Variables:**
   Salin `.env.example` ke `.env`:
   ```bash
   cp .env.example .env
   ```
   Pastikan `DATABASE_URL` sesuai dengan konfigurasi PostgreSQL Anda, contoh:
   ```env
   PORT=3000
   NODE_ENV=development
   DATABASE_URL="postgresql://postgres:postgres_password@localhost:5433/whatsapp_db?schema=public"
   LOG_LEVEL=info
   ```

4. **Sinkronisasi Schema Database:**
   Generate client Prisma dan migrasi database:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Jalankan Server Development:**
   ```bash
   npm run dev
   ```

6. **Buka Aplikasi di Browser:**
   Akses `http://localhost:3000`. Scan QR Code yang muncul menggunakan aplikasi WhatsApp di smartphone Anda (**Perangkat Tertaut / Linked Devices**).

---

## 📁 Struktur Direktori

```
whatsapp_UI_baileys/
├── data/                       # Penyimpanan file lokal & Baileys auth state
│   └── whatsapp/auth/          # Kunci sesi dan credentials WhatsApp (Signal keys)
├── prisma/
│   └── schema.prisma           # Skema database (Chat, Message, Contact, Media, Setting)
├── src/
│   ├── app/                    # Next.js App Router (Halaman & Endpoint API)
│   │   ├── api/
│   │   │   ├── channels/       # API endpoints untuk saluran/newsletters
│   │   │   ├── chats/          # API endpoints data obrolan & riwayat
│   │   │   ├── media/          # API streaming file media terenkripsi
│   │   │   ├── messages/       # API pengiriman pesan
│   │   │   └── whatsapp/       # Endpoint manajemen koneksi, presence, & auth
│   │   ├── page.tsx            # Komponen halaman utama aplikasi
│   │   └── layout.tsx          # Root layout
│   ├── components/             # Komponen UI React
│   │   ├── ChatSidebar.tsx     # Sidebar (Tab Chats, Status, Channels, Search, Toggles)
│   │   ├── ChatWindow.tsx      # Jendela obrolan aktif & pesan
│   │   ├── MessageBubble.tsx   # Gelembung pesan (teks, media, reaksi, quote)
│   │   ├── MessageInput.tsx    # Kotak input kirim pesan
│   │   ├── QRScreen.tsx        # Layar pairing QR Code & status koneksi
│   │   ├── StatusView.tsx      # Komponen tampilan status update
│   │   └── NotificationToast.tsx
│   ├── hooks/                  # Custom React hooks (useSocket, useAudioNotification, dll.)
│   ├── lib/                    # Client-side utilities & HTTP API client
│   ├── server/                 # Backend Core Services (Hanya dieksekusi di Node.js)
│   │   ├── db/                 # Prisma client instance
│   │   ├── services/           # WhatsAppService (Baileys singleton & event handler)
│   │   └── socket/             # Socket.IO handler
│   └── types/                  # TypeScript interface & internal model definitions
├── server.ts                   # Custom entrypoint server HTTP + Socket.IO + Next.js
├── docker-compose.yml          # Konfigurasi orkestrasi container Docker
├── Dockerfile                  # Multi-stage build Dockerfile
└── README.md                   # Dokumentasi proyek
```

---

## 🔒 Catatan Keamanan & Privasi

1. **Kerahasiaan Sesi**: Direktori `data/whatsapp/auth` berisi kunci enkripsi Signal dan token sesi WhatsApp Anda. Jangan pernah mengunggah atau membagikan folder ini ke publik.
2. **Lingkungan Terisolasi**: Disarankan untuk menjalankan aplikasi ini di jaringan privat, VPN lokal (seperti Tailscale atau WireGuard), atau di balik reverse proxy yang aman dengan otentikasi tambahan.
3. **Pemberitahuan Read Receipts**: Jika opsi auto-centang biru dimatikan melalui antarmuka, aplikasi tidak akan mengirimkan status `read` ke server WhatsApp saat Anda membuka ruang obrolan.

---

## 📜 Lisensi & Penafian

Proyek ini dibuat untuk tujuan edukasi dan penggunaan pribadi (*personal homelab*). WhatsApp adalah merek dagang terdaftar dari Meta Platforms, Inc. Proyek ini tidak berafiliasi, disponsori, atau didukung secara resmi oleh Meta.
