# Roblox Live Stream Center

Ruang kendali untuk streamer TikTok LIVE. Aplikasi menerima event TikTok LIVE melalui TikFinity Desktop, menjalankan antrean review tiga tingkat (VIP Express, Fast Track, Normal), mencari akun Roblox publik, dan menampilkan review yang sedang berjalan di overlay OBS berukuran 1920 x 1080.

Aplikasi dapat memakai project Supabase hosted yang ada di `.env`, atau database PostgreSQL lokal tanpa Docker.

## Persyaratan

- Node.js 20.19 atau lebih baru (versi LTS juga bisa).
- Windows 10 atau 11 64-bit untuk database lokal. Stack lokal memakai PostgreSQL dan PostgREST bawaan, jadi tidak perlu Docker, WSL, atau instalasi PostgreSQL terpisah.

## Cara menjalankan

Pilih salah satu dari dua cara berikut.

**1. Memakai Supabase hosted (default):**

```
npm install
npm run dev
```

Buka `http://127.0.0.1:5173`.

**2. Memakai database lokal (tanpa Docker):**

```
npm install
npm run dev:local
```

Buka `http://127.0.0.1:5173`. Perintah ini sekaligus menyalakan database, REST API, fungsi lookup, dan aplikasi.

Hentikan server dengan `Ctrl+C` di terminal. Data lokal tetap tersimpan dan dipakai lagi pada run berikutnya.

## Setup pertama kali

1. Install Node.js LTS dari nodejs.org (pilihan default sudah cukup).
2. Buka folder project di terminal (PowerShell atau Command Prompt).
3. Install dependency sekali saja:

   ```
   npm install
   ```

4. Periksa `.env`. Untuk Supabase hosted, isi dua nilai berikut:

   ```
   VITE_SUPABASE_URL=https://project-anda.supabase.co
   VITE_SUPABASE_ANON_KEY=anon-key-anda
   ```

   Untuk database lokal, langkah ini dilewati karena `npm run dev:local` membuat URL dan key sendiri.

5. (Opsional) Pastikan project bisa di-build:

   ```
   npm run build
   ```

6. Jalankan aplikasi dengan `npm run dev`, atau dengan `npm run dev:local` bila memakai database lokal.

## Variabel lingkungan

Aplikasi membaca variabel berikut dari `.env` (atau dari environment terminal saat Vite dijalankan):

| Nama | Fungsi |
| --- | --- |
| `VITE_SUPABASE_URL` | URL project Supabase. |
| `VITE_SUPABASE_ANON_KEY` | Anon key publik. Aman dikirim ke browser karena Row Level Security yang menentukan data apa yang boleh dibaca. |
| `VITE_FUNCTIONS_BASE_URL` | Opsional. Mengubah alamat pemanggilan edge function. Default-nya `${VITE_SUPABASE_URL}/functions/v1`. |

Jangan pernah menaruh `service_role` key di `.env` atau variabel `VITE_` apa pun, karena nilainya ikut terkirim ke browser. Fungsi lookup Roblox menerima service role key dari Supabase dan menulis tabel cache sendiri.

## Database lokal (tanpa Docker)

`npm run dev:local` menyalakan stack lokal secara lengkap:

- PostgreSQL 18 di `127.0.0.1:54322`, dengan data di `.local-db/pgdata`.
- Semua migrasi di `supabase/migrations`, dijalankan sesuai urutan nama file.
- PostgREST dan gateway kecil yang kompatibel dengan Supabase di `127.0.0.1:54321`, melayani `/rest/v1` dan `/functions/v1` seperti project hosted.
- Fungsi `roblox-lookup` yang dijalankan dengan Deno.
- Aplikasi di `http://127.0.0.1:5173` yang diarahkan ke stack lokal.

Perintah yang tersedia:

| Perintah | Fungsi |
| --- | --- |
| `npm run dev:local` | Menyalakan semuanya, termasuk aplikasi. |
| `npm run db:local` | Hanya database, REST API, dan fungsi (tanpa aplikasi). |
| `npm run db:reset` | Menghapus data lokal (schema `public`) dan menjalankan ulang semua migrasi. |

Catatan:

- Run pertama mengunduh PostgREST sekali ke `.local-db/bin` dan membutuhkan internet. Run berikutnya tidak perlu mengunduh lagi, tetapi analisis akun tetap memanggil Roblox.
- Data bertahan setelah restart. Gunakan `npm run db:reset` untuk mulai dari database kosong.
- URL dan key lokal dibuat otomatis di `.local-db/` dan tidak di-commit. `.env` milik Supabase hosted tidak diubah.
- Cluster lokal dibuat dengan encoding UTF8 agar bio Roblox, emoji, dan username non-Latin tersimpan dengan benar.
- Port bisa diganti lewat `LOCAL_PG_PORT`, `LOCAL_REST_PORT`, `LOCAL_FUNCTIONS_PORT`, `LOCAL_API_PORT`, dan `LOCAL_APP_PORT` jika bentrok dengan aplikasi lain.
- Realtime belum termasuk di stack lokal, jadi overlay memakai refresh otomatis setiap 5 detik. Fitur lain, termasuk Account Analyzer, berjalan sama.
- Folder `.local-db` aman dihapus. Folder itu dibuat ulang saat run berikutnya.

## Setup TikFinity

1. Buka TikFinity Desktop dan nyalakan WebSocket server-nya. Alamat default-nya `localhost` port `21213`.
2. Di aplikasi, buka **System Settings** dan cek status **TikFinity WebSocket**. Statusnya harus **Connected**.
3. Jika TikFinity memakai alamat atau port lain, ubah di **System Settings** lalu tekan **Save connection**. Aplikasi menyambung ulang otomatis dengan jeda yang makin lama (hingga 30 detik) bila koneksi terputus.
4. Mulai LIVE. Pesan chat dengan `!review <UsernameRoblox>` memasukkan penonton ke antrean. Gift yang cocok dengan rule aktif di **Gift Configuration** memindahkan penonton ke tier rule tersebut setelah ambang koin tercapai.

## Setup OBS Browser Source

1. Buka halaman **OBS Overlay** di aplikasi dan salin **Browser Source address**.
2. Di OBS, tambahkan source **Browser** ke scene dan tempel alamat tadi ke kolom URL.
3. Isi **Width** dengan `1920` dan **Height** dengan `1080`.
4. Biarkan aplikasi tetap berjalan selama stream. Overlay memperbarui dirinya saat review aktif berubah.

Overlay tidak terhubung langsung ke TikFinity. Overlay hanya membaca antrean review dan data Roblox terverifikasi yang disimpan aplikasi, sehingga tampilannya selalu sama dengan halaman kontrol.

## Halaman

- **Overview**: total sesi, aktivitas terakhir, dan status sistem.
- **Live Monitor**: event masuk dengan filter dan pencarian.
- **Review Queue**: mulai, selesaikan, batalkan, atau hapus penonton. Hanya satu review yang berjalan pada satu waktu.
- **Account Analyzer**: detail profil publik Roblox (bio, badge verified, tanggal bergabung, tipe avatar, presence, grup), avatar full-body, outfit yang dipakai, seluruh inventory publik termasuk item off-sale, serta estimasi harga katalog/resale dengan status ketersediaan, rarity, dan total nilai inventory.
- **Gift Configuration**: gift mana yang mendapat tier prioritas dan berapa koin yang dibutuhkan.
- **AI & Voice**: gaya narasi, suara, kecepatan, dan pitch, dengan preview di browser.
- **OBS Overlay**: alamat Browser Source dan preview langsung.
- **Review History**: riwayat review yang bisa dicari, dengan ekspor CSV.
- **System Settings**: koneksi TikFinity, status layanan, dan log aktivitas.

## Cara nilai akun dihitung

- Nilai outfit menjumlahkan harga katalog publik dari setiap item yang dipakai dan sedang dijual.
- Item limited dihitung dengan harga resale terendah, bukan harga jual aslinya.
- Total inventory menjumlahkan harga semua item yang dimiliki dan punya harga publik, termasuk item off-sale yang masih punya harga resale.
- Item gratis tidak menambah nilai. Item off-sale tetap tampil di daftar dan hanya masuk total bila masih punya harga resale (umumnya item limited).
- Nilai Robux bisa melebihi batas kolom 32-bit (limited 1-of-1 langka mencapai 100 miliar), jadi nilai disimpan sebagai integer 64-bit.
- Angka Rupiah adalah konversi tampilan dengan kurs tetap agar mudah dibaca. Itu bukan kurs real-time dan bukan pengeluaran.

## Catatan penting

- Semua angka adalah estimasi dari katalog publik: bukan jumlah yang dibayar pemilik akun, bukan nilai pasar, dan bukan harga jual seluruh akun.
- Inventory Roblox yang privat hanya menampilkan outfit yang dipakai dan item limited publik, dan aplikasi menjelaskan hal itu.
- Roblox membatasi permintaan harga katalog menjadi 10 per menit per IP. Harga di-cache dan dipakai bersama antar-lookup selama enam jam, jadi satu lookup bisa memakai harga yang sudah diambil lookup lain. Jika Roblox tetap membatasi, item limited memakai data resale publik (atau cache harga bersama) dan analyzer menampilkan catatan kecil, bukan gagal.
- Karena batas tersebut, satu lookup menghargai hingga 900 item. Akun dengan inventory lebih besar tetap menampilkan catatan "Showing X of Y owned item(s)", dan totalnya dihitung dari item yang ditampilkan. Inventory privat hanya menampilkan outfit yang dipakai dan item limited publik, dengan total berlabel "Visible items only".
- Hasil lookup di-cache selama 30 menit. Username yang sama akan mengembalikan profil dan inventory dari cache, sehingga lookup kedua jauh lebih cepat.
- Narasi hanya dibuat dari data akun yang terverifikasi. Nilai yang tidak tersedia tidak diisi dengan tebakan.
- Suara memakai voice bawaan browser. Pilihan suara tergantung Windows dan browser yang dipakai.

## Update database

Account Analyzer menyimpan detail publik (bio, badge verified, presence, grup, nilai outfit dan limited), total inventory, serta harga per item. Dua migrasi terakhir adalah `supabase/migrations/20261109195500_add_roblox_public_details.sql` (detail publik, kolom harga `bigint`, cache bersama `roblox_asset_prices`) dan `supabase/migrations/20261109213000_add_inventory_totals.sql` (`inventory_value` dan `inventory_item_count`).

Jika project Supabase hosted dibuat sebelum versi ini, jalankan migrasinya (misalnya dengan `supabase db push`) dan deploy ulang fungsi `roblox-lookup`. Urutannya tidak masalah: fungsi mendeteksi kolom atau tabel yang belum ada dan tetap berjalan, tetapi detail tambahan baru disajikan dari cache setelah migrasi diterapkan. Stack lokal menjalankan semua migrasi otomatis pada `npm run dev:local` dan `npm run db:reset`.

## Pemecahan masalah

- **Port sudah dipakai.** Hentikan proses lain, atau jalankan stack dengan port berbeda, misalnya `LOCAL_APP_PORT=5174 npm run dev:local`.
- **Stack lokal gagal menyala.** Baca baris `[local]` di terminal; baris itu menyebut langkah yang gagal (PostgreSQL, migrasi, PostgREST, fungsi, atau aplikasi).
- **Database terlihat basi atau rusak.** Jalankan `npm run db:reset`. Jika masih gagal, hentikan stack, hapus folder `.local-db`, lalu jalankan lagi.
- **PostgREST gagal diunduh.** Run pertama butuh akses internet ke GitHub releases. Run berikutnya memakai `.local-db/bin/postgrest.exe` yang sudah ada.
