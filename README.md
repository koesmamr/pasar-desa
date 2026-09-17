# 🌾 Pasar Desa Nusantara (Ubuntu 24 VPS Ready)

Platform digital toko online dan e-commerce berbasis **BUMDes** (Badan Usaha Milik Desa) untuk memasarkan produk unggulan UMKM, pertanian, perkebunan, dan kerajinan tangan warga desa ke seluruh Indonesia sekaligus meningkatkan **PAD (Pendapatan Asli Desa)** secara otomatis dan transparan.

---

## ⚡ Metode Cepat: Autoinstall 1 Perintah (Rekomendasi VPS Ubuntu 24 / 22)

Untuk menginstal **Pasar Desa Nusantara** di VPS Ubuntu 24.04 / 22.04 LTS baru, cukup login sebagai user **`root`** via SSH dan jalankan **1 baris perintah** berikut:

```bash
curl -sSL https://raw.githubusercontent.com/koesmamr/pasar-desa/main/pasardesainstall.sh | bash
```
*(atau bisa juga menggunakan `install.sh`):*
```bash
curl -sSL https://raw.githubusercontent.com/koesmamr/pasar-desa/main/install.sh | bash
```

### 🤖 Apa yang Dilakukan Script Ini Secara Otomatis?
1. **Update Sistem**: Memperbarui paket Ubuntu dan memasang dependensi (Git, Nginx, Certbot, SQLite, build-essential).
2. **Install Node.js 22 LTS & PM2**: Memasang runtime Node.js v22 dan PM2 Process Manager secara global.
3. **Download Repository**: Meng-clone repository `koesmamr/pasar-desa` ke direktori `/var/www/pasar-desa`.
4. **Install Dependensi NPM**: Memasang package `express`, `bcryptjs`, `dotenv`, dll.
5. **Setup Konfigurasi `.env` & Database**: Menginisialisasi basis data SQLite lokal mode WAL dan akun pengelola BUMDes.
6. **Konfigurasi Nginx Reverse Proxy**: Mengatur Nginx agar port 80 langsung me-forward request ke aplikasi Node.js (port 3000).
7. **Jalankan Aplikasi via PM2**: Aplikasi langsung aktif, tersimpan, dan otomatis menyala kembali jika VPS di-reboot.

---

## 🌟 Fitur Utama Platform

1. **Desain Toko Bernuansa Lokal Nusantara:**
   - Visual hangat (*earthy brown & warm cream*) sesuai kearifan lokal.
   - Banner panorama desa, etalase produk unggulan desa, dan filter kategori interaktif (Pangan, Makanan Olahan, Pertanian, Kerajinan Tangan, Herbal).
2. **Dual Mode Pemesanan & Checkout:**
   - **Checkout WhatsApp BUMDes:** Pembeli langsung terhubung ke nomor WA pengelola BUMDes dengan format invoice rapi sekali klik.
   - **Checkout QRIS & Transfer Bank:** Menyajikan barcode QRIS otomatis dan rekening bank resmi BUMDes.
3. **Kalkulator PAD (Pendapatan Asli Desa) Otomatis:**
   - Setiap transaksi otomatis menghitung persentase alokasi dana untuk kas desa (misal: 5% untuk pembangunan posyandu dan fasilitas warga).
4. **Cerita Desa (Storytelling & Traceability):**
   - Halaman khusus profil perajin dan kelompok tani desa untuk meningkatkan nilai jual emosional produk lokal.
5. **Panel Pengelola BUMDes (`/admin`):**
   - Dashboard statistik omzet dan akumulasi kas PAD.
   - Manajemen produk (tambah, edit harga/stok/foto, hapus).
   - Manajemen order masuk & update status pesanan.
   - Konfigurasi Whitelabel Desa (ganti nama desa, BUMDes, logo, nomor WA, dan persentase PAD tanpa sentuh koding).

---

## 🔐 Kredensial Login Default Panel Pengelola

Setelah instalasi selesai, buka panel pengelola di browser:
- **URL Admin:** `http://IP_VPS_ANDA/admin`
- **Username:** `admin`
- **Password:** `admin123`

*(Password dan profil dapat diubah langsung dari file `.env` atau menu Pengaturan)*

---

## 🌐 Pasang Domain & SSL HTTPS Gratis (Let's Encrypt)

Setelah domain desa Anda (misal `pasardesa-sukamaju.id` atau subdomain) sudah diarahkan DNS A Record-nya ke IP VPS, jalankan perintah berikut di terminal VPS:

```bash
certbot --nginx -d pasardesa-sukamaju.id -d www.pasardesa-sukamaju.id
```

*Certbot otomatis memperbarui konfigurasi Nginx dan memperpanjang sertifikat SSL secara berkala.*

---

## 🛠️ Perintah Pemeliharaan Server VPS

Semua operasi aplikasi dapat dipantau dan dikelola dengan mudah melalui terminal:

| Kebutuhan | Perintah di Terminal VPS |
| :--- | :--- |
| **Cek Status Server** | `pm2 status` |
| **Lihat Log Realtime** | `pm2 logs pasar-desa` |
| **Restart Aplikasi** | `pm2 restart pasar-desa` |
| **Stop Aplikasi** | `pm2 stop pasar-desa` |
| **Edit Pengaturan (.env)** | `nano /var/www/pasar-desa/.env` *(lalu jalankan `pm2 restart pasar-desa`)* |
| **Restart Web Server Nginx** | `systemctl restart nginx` |
| **Backup Database Manual** | `cp /var/www/pasar-desa/data/pasardesa.db /root/backup-$(date +%F).db` |

---

## 💻 Menjalankan di Komputer Lokal (Development)

Jika ingin menguji atau memodifikasi kode di laptop/PC lokal:

```bash
# 1. Clone repository
git clone https://github.com/koesmamr/pasar-desa.git
cd pasar-desa

# 2. Install dependensi
npm install

# 3. Buat file konfigurasi
copy .env.example .env

# 4. Jalankan server lokal
npm start
# atau mode auto-reload dev:
npm run dev
```
Akses web lokal melalui browser: [http://localhost:3000](http://localhost:3000)

---

## 📁 Struktur Direktori Proyek

```text
pasar-desa/
├── data/
│   └── pasardesa.db         # Database SQLite lokal (otomatis terbuat)
├── public/
│   ├── css/
│   │   └── style.css        # Desain kearifan lokal bernuansa terracotta & cream
│   ├── js/
│   │   ├── app.js           # Logika katalog, keranjang belanja & checkout WA
│   │   └── admin.js         # Logika panel pengelola BUMDes & CRUD produk
│   ├── index.html           # Halaman utama etalase Pasar Desa Nusantara
│   └── admin.html           # Halaman panel dashboard BUMDes & PAD
├── src/
│   ├── db.js                # Inisialisasi SQLite (node:sqlite & better-sqlite3)
│   └── routes/
│       ├── api.js           # API publik (produk, kategori, order, stories)
│       └── admin.js         # API pengelola (auth, stats, CRUD, settings)
├── .env.example             # Template konfigurasi environment
├── .gitignore               # Pengecualian Git
├── ecosystem.config.js      # Konfigurasi PM2 Process Manager
├── install.sh               # Alias skrip autoinstall VPS
├── package.json             # Manifest dependensi project
├── pasardesainstall.sh      # Skrip autoinstall sekali jalan untuk Ubuntu 24/22
├── server.js                # Entry point server HTTP Express
└── README.md                # Dokumentasi & panduan instalasi
```

---

## 🔒 Lisensi & Hak Cipta
Dibuat untuk memajukan perekonomian desa dan mendigitalkan UMKM desa di seluruh pelosok Nusantara. Bebas dikembangkan dan dimanfaatkan oleh Pemerintah Desa dan BUMDes se-Indonesia.
