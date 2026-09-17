#!/usr/bin/env bash
# ==============================================================================
# AUTOINSTALL SCRIPT: PASAR DESA NUSANTARA
# Target OS: Ubuntu 24.04 LTS / Ubuntu 22.04 LTS
# GitHub Repo: https://github.com/koesmamr/pasar-desa.git
# ==============================================================================

set -e

# Warna Terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "=================================================================="
echo "    🌾 AUTOINSTALL PASAR DESA NUSANTARA - UBUNTU 24 READY 🌾     "
echo "        Platform Toko BUMDes & Akselerator PAD Desa Digital       "
echo "=================================================================="
echo -e "${NC}"

# 1. Validasi Akses Root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERROR] Script ini wajib dijalankan sebagai user root!${NC}"
    echo "Gunakan perintah: sudo bash pasardesainstall.sh atau login sebagai root."
    exit 1
fi

APP_DIR="/var/www/pasar-desa"
REPO_URL="https://github.com/koesmamr/pasar-desa.git"
BRANCH="main"

# 2. Update Sistem & Instalasi Paket Dasar
echo -e "${YELLOW}==> [1/7] Memperbarui repositori paket Ubuntu & dependensi...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ufw nginx certbot python3-certbot-nginx build-essential sqlite3 ca-certificates gnupg

# 3. Instalasi Node.js 22 LTS & PM2
echo -e "${YELLOW}==> [2/7] Memeriksa & Menginstal Node.js 22 LTS...${NC}"
NODE_VER=$(node -v 2>/dev/null || echo "none")
if [[ "$NODE_VER" != v22* && "$NODE_VER" != v20* && "$NODE_VER" != v24* ]]; then
    echo "Memasang Node.js v22 LTS dari NodeSource..."
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
    apt-get update -y
    apt-get install -y nodejs
else
    echo "Node.js sudah terpasang: $NODE_VER"
fi

echo -e "${YELLOW}==> [3/7] Memasang PM2 Process Manager secara global...${NC}"
npm install -g pm2

# 4. Unduh / Update Source Code Pasar Desa
echo -e "${YELLOW}==> [4/7] Mengunduh source code Pasar Desa ke ${APP_DIR}...${NC}"
if [ -d "$APP_DIR/.git" ]; then
    echo "Direktori sudah ada. Melakukan git pull update..."
    cd "$APP_DIR"
    git fetch origin
    git reset --hard "origin/$BRANCH"
else
    mkdir -p /var/www
    rm -rf "$APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# 5. Instal Dependensi NPM
echo -e "${YELLOW}==> [5/7] Menginstal dependensi NPM aplikasi...${NC}"
cd "$APP_DIR"
npm install --omit=dev

# Buat direktori data SQLite jika belum ada
mkdir -p "$APP_DIR/data"

# Buat file .env dari .env.example jika belum ada
if [ ! -f "$APP_DIR/.env" ]; then
    echo "Menyiapkan file .env baru dari .env.example..."
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
fi

# 6. Konfigurasi Nginx Reverse Proxy (Port 80 -> Port 3000)
echo -e "${YELLOW}==> [6/7] Mengonfigurasi Nginx Reverse Proxy...${NC}"
cat > /etc/nginx/sites-available/pasar-desa << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF

# Aktifkan virtual host Nginx
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/pasar-desa /etc/nginx/sites-enabled/pasar-desa
nginx -t && systemctl restart nginx

# 7. Menjalankan Aplikasi via PM2
echo -e "${YELLOW}==> [7/7] Menjalankan Pasar Desa via PM2 Process Manager...${NC}"
cd "$APP_DIR"
pm2 delete pasar-desa 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# Izinkan Firewall UFW
ufw allow 'Nginx Full' 2>/dev/null || true
ufw allow 22/tcp 2>/dev/null || true

# Deteksi IP Publik Server VPS
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "IP_VPS_ANDA")

echo ""
echo -e "${GREEN}=================================================================="
echo "    🎉 INSTALASI PASAR DESA NUSANTARA BERHASIL SELESAI!          "
echo "==================================================================${NC}"
echo ""
echo -e "🌐 Website Pasar Desa aktif di:  ${CYAN}http://${SERVER_IP}${NC}"
echo -e "🏛️ Panel Admin BUMDes di:        ${CYAN}http://${SERVER_IP}/admin${NC}"
echo -e "🔑 Kredensial Login Default:"
echo -e "   - Username: ${YELLOW}admin${NC}"
echo -e "   - Password: ${YELLOW}admin123${NC}"
echo ""
echo -e "📁 Lokasi Aplikasi: ${CYAN}/var/www/pasar-desa${NC}"
echo -e "⚙️ Edit Pengaturan (.env): ${CYAN}nano /var/www/pasar-desa/.env${NC}"
echo -e "🔄 Restart Server:         ${CYAN}pm2 restart pasar-desa${NC}"
echo -e "📜 Cek Log Realtime:       ${CYAN}pm2 logs pasar-desa${NC}"
echo ""
echo -e "🔐 ${GREEN}PANDUAN MEMASANG DOMAIN & SSL HTTPS (GRATIS):${NC}"
echo "1. Arahkan A Record domain Anda ke IP VPS: ${SERVER_IP}"
echo "2. Jalankan perintah certbot:"
echo "   certbot --nginx -d domaindesa.id -d www.domaindesa.id"
echo "=================================================================="
