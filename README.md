# 🌾 Pasar Desa Nusantara (Ubuntu 24 VPS Ready)

Platform digital toko online dan e-commerce berbasis **BUMDes** (Badan Usaha Milik Desa) untuk memasarkan produk unggulan UMKM, pertanian, perkebunan, dan kerajinan tangan warga desa ke seluruh Indonesia sekaligus meningkatkan **PAD (Pendapatan Asli Desa)** secara otomatis dan transparan.

> **💡 Multi-App Safe:** Aplikasi ini dirancang agar dapat diinstal di VPS baru maupun **berdampingan dengan aplikasi lain yang sudah ada** (seperti `warungpulsa`) tanpa bentrok port dan tanpa menimpa konfigurasi Nginx yang sudah ada.

---

## ⚡ Metode Cepat: Autoinstall 1 Perintah (VPS Ubuntu 24 / 22)

Login sebagai user **`root`** via SSH dan jalankan **1 baris perintah** berikut:

```bash
curl -sSL https://raw.githubusercontent.com/koesmamr/pasar-desa/main/pasardesainstall.sh | bash
```

*(Atau jika ingin langsung menentukan domain khusus untuk Pasar Desa):*
```bash
DOMAIN="pasardesa-desa.id" curl -sSL https://raw.githubusercontent.com/koesmamr/pasar-desa/main/pasardesainstall.sh | bash
```

---

## 🛡️ Mengapa Aman dari Bentrok dengan Warung Pulsa?

Script instalasi telah dibekali deteksi cerdas multi-aplikasi:
1. **Port Internal Berbeda**:
   - `warungpulsa` berjalan di internal Port **3000**.
   - `pasar-desa` berjalan di internal Port **3001**.
2. **Proses PM2 Terpisah**:
   - Masing-masing aplikasi memiliki nama unik (`warungpulsa` & `pasar-desa`), sehingga keduanya berjalan bersamaan dan dapat dicek via `pm2 status`.
3. **Konfigurasi Nginx Cerdas**:
   - Jika VPS mendeteksi `warungpulsa`, script **TIDAK AKAN** menghapus konfigurasi Nginx `warungpulsa`.
   - `warungpulsa` tetap melayani di Port 80 (`http://IP_VPS`), sedangkan `pasar-desa` otomatis disiapkan di Port 8080 (`http://IP_VPS:8080`) atau langsung di domain desa Anda.
4. **Folder Terisolasi**:
   - `warungpulsa` berada di `/var/www/warungpulsa`.
   - `pasar-desa` berada di `/var/www/pasar-desa`.

---

## 🌟 Fitur Utama Platform

1. **Desain Toko Bernuansa Lokal Nusantara:**
   - Visual hangat (*earthy brown & warm cream*) sesuai kearifan lokal desa.
   - Banner panorama pedesaan, etalase produk unggulan desa, dan filter kategori interaktif (Pangan, Makanan Olahan, Pertanian, Kerajinan Tangan, Herbal).
2. **Dual Mode Pemesanan & Checkout:**
   - **Checkout WhatsApp BUMDes:** Pembeli langsung terhubung ke WhatsApp pengelola BUMDes dengan format invoice terstruktur.
   - **Checkout QRIS & Transfer Bank:** Menyajikan barcode QRIS otomatis dan rekening bank resmi BUMDes.
3. **Kalkulator PAD (Pendapatan Asli Desa) Otomatis:**
   - Setiap transaksi otomatis menghitung persentase alokasi dana untuk kas desa (misal: 5% untuk pembangunan sarana desa).
4. **Cerita Desa (Storytelling & Traceability):**
   - Halaman profil perajin dan kelompok tani desa untuk meningkatkan nilai emosional produk lokal.
5. **Panel Pengelola BUMDes (`/admin`):**
   - Dashboard statistik omzet dan akumulasi kas PAD.
   - Manajemen produk (tambah, edit harga/stok/foto, hapus).
   - Manajemen order masuk & update status pesanan.
   - Konfigurasi Whitelabel Desa (ganti nama desa, BUMDes, logo, nomor WA, dan persentase PAD tanpa sentuh koding).

---

## 🔐 Kredensial Login Default Panel Pengelola

- **URL Admin:** `http://IP_VPS_ANDA:8080/admin` *(atau `http://domain-desa.id/admin` jika pakai domain)*
- **Username:** `admin`
- **Password:** `admin123`

---

## 🌐 Pasang Domain & SSL HTTPS Gratis (Let's Encrypt)

Jika Anda ingin Pasar Desa memiliki domain tersendiri (misal: `pasardesa.id`):
1. Arahkan DNS A-Record domain ke IP VPS Anda.
2. Edit file virtual host Nginx:
   ```bash
   nano /etc/nginx/sites-available/pasar-desa
   ```
   Ubah `listen 8080;` menjadi `listen 80;` dan ubah `server_name _;` menjadi:
   ```nginx
   server_name pasardesa.id www.pasardesa.id;
   ```
3. Simpan dan reload Nginx:
   ```bash
   systemctl reload nginx
   ```
4. Aktifkan SSL HTTPS gratis:
   ```bash
   certbot --nginx -d pasardesa.id -d www.pasardesa.id
   ```

---

## 🛠️ Perintah Pemeliharaan Server VPS

| Kebutuhan | Perintah di Terminal VPS |
| :--- | :--- |
| **Cek Status Semua Web (Warung Pulsa & Pasar Desa)** | `pm2 status` |
| **Lihat Log Pasar Desa** | `pm2 logs pasar-desa` |
| **Restart Pasar Desa** | `pm2 restart pasar-desa` |
| **Edit Pengaturan (.env)** | `nano /var/www/pasar-desa/.env` *(lalu `pm2 restart pasar-desa`)* |
| **Update Kode dari GitHub** | `cd /var/www/pasar-desa && git pull origin main && pm2 restart pasar-desa` |

---

## 🔒 Lisensi & Hak Cipta
Dibuat untuk memajukan perekonomian desa dan mendigitalkan UMKM desa di seluruh pelosok Nusantara. Bebas dikembangkan dan dimanfaatkan oleh Pemerintah Desa dan BUMDes se-Indonesia.
