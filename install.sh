#!/usr/bin/env bash
# ==============================================================================
# AUTOINSTALL SCRIPT: PASAR DESA NUSANTARA (MULTI-APP SAFE)
# Target OS: Ubuntu 24.04 LTS / Ubuntu 22.04 LTS
# Aman dipasang berdampingan dengan aplikasi lain (misal: warungpulsa)
# ==============================================================================

set -e

# Warna Terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

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
APP_PORT=3001

# 2. Deteksi Apakah Ada Aplikasi Lain yang Sudah Berjalan (misal Warung Pulsa)
echo -e "${YELLOW}==> Memeriksa lingkungan server (Cek aplikasi lain)...${NC}"
HAS_WARUNGPULSA=false
if [ -d "/var/www/warungpulsa" ] || [ -f "/etc/nginx/sites-available/warungpulsa" ]; then
    HAS_WARUNGPULSA=true
    echo -e "${GREEN}[INFO TERDETEKSI] Aplikasi Warung Pulsa ditemukan di VPS ini.${NC}"
    echo -e "${GREEN}Script akan mengonfigurasi Pasar Desa di Port ${APP_PORT} secara TERISOLASI agar Warung Pulsa TIDAK BENTROK.${NC}"
fi

# 3. Update Sistem & Instalasi Paket Dasar
echo -e "${YELLOW}==> [1/7] Memperbarui repositori paket Ubuntu & dependensi...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ufw nginx certbot python3-certbot-nginx build-essential sqlite3 ca-certificates gnupg

# 4. Instalasi Node.js 22 LTS & PM2
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

# 5. Unduh / Update Source Code Pasar Desa
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

# 6. Instal Dependensi NPM
echo -e "${YELLOW}==> [5/7] Menginstal dependensi NPM aplikasi...${NC}"
cd "$APP_DIR"
npm install --omit=dev

# Buat direktori data SQLite jika belum ada
mkdir -p "$APP_DIR/data"

# Buat file .env dari .env.example jika belum ada
if [ ! -f "$APP_DIR/.env" ]; then
    echo "Menyiapkan file .env baru dari .env.example..."
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    sed -i "s/PORT=3000/PORT=3001/g" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
fi

# 7. Konfigurasi Nginx Reverse Proxy Multi-Site Aman
echo -e "${YELLOW}==> [6/7] Mengonfigurasi Nginx Reverse Proxy Pasar Desa (Port ${APP_PORT})...${NC}"

# Cek domain dari argumen atau environment (DOMAIN=contoh.com bash pasardesainstall.sh)
DESA_DOMAIN="${DOMAIN:-}"

if [ -n "$DESA_DOMAIN" ]; then
    # Jika diberikan domain khusus
    echo "Menggunakan domain khusus: $DESA_DOMAIN"
    cat > /etc/nginx/sites-available/pasar-desa << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DESA_DOMAIN www.$DESA_DOMAIN;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF
else
    # Jika belum ada domain dan berjalan bersama warungpulsa
    if [ "$HAS_WARUNGPULSA" = true ]; then
        echo "Mengatur Pasar Desa pada Port 8080 agar Port 80 Warung Pulsa tetap aman..."
        cat > /etc/nginx/sites-available/pasar-desa << EOF
server {
    listen 8080;
    listen [::]:8080;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF
    else
        # VPS Fresh (belum ada warungpulsa)
        cat > /etc/nginx/sites-available/pasar-desa << EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    listen 8080;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF
        rm -f /etc/nginx/sites-enabled/default
    fi
fi

# Aktifkan site pasar-desa di Nginx (tanpa menghapus site warungpulsa!)
ln -sf /etc/nginx/sites-available/pasar-desa /etc/nginx/sites-enabled/pasar-desa
nginx -t && systemctl restart nginx

# 8. Menjalankan Aplikasi via PM2 (Nama proses independen: pasar-desa)
echo -e "${YELLOW}==> [7/7] Menjalankan Pasar Desa via PM2 Process Manager...${NC}"
cd "$APP_DIR"
pm2 delete pasar-desa 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# Izinkan Port Firewall UFW
ufw allow 'Nginx Full' 2>/dev/null || true
ufw allow 22/tcp 2>/dev/null || true
ufw allow 8080/tcp 2>/dev/null || true
ufw allow 3001/tcp 2>/dev/null || true

# Deteksi IP Publik Server VPS
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "IP_VPS_ANDA")

echo ""
echo -e "${GREEN}=================================================================="
echo "    🎉 INSTALASI PASAR DESA BERHASIL & AMAN DARI BENTROK!        "
echo "==================================================================${NC}"
echo ""

if [ "$HAS_WARUNGPULSA" = true ]; then
    echo -e "${MAGENTA}🔍 STATUS DUA APLIKASI DI VPS INI:${NC}"
    echo -e "   1. 🏪 Warung Pulsa:  ${CYAN}http://${SERVER_IP}${NC} (Port 3000 - Tetap Normal & Tidak Terganggu)"
    echo -e "   2. 🌾 Pasar Desa:    ${CYAN}http://${SERVER_IP}:8080${NC} (Port 3001 internal)"
    echo -e "      🏛️ Admin BUMDes:  ${CYAN}http://${SERVER_IP}:8080/admin${NC}"
else
    echo -e "🌐 Website Pasar Desa aktif di:  ${CYAN}http://${SERVER_IP}${NC} atau ${CYAN}http://${SERVER_IP}:8080${NC}"
    echo -e "🏛️ Panel Admin BUMDes di:        ${CYAN}http://${SERVER_IP}/admin${NC}"
fi

echo ""
echo -e "🔑 Kredensial Login Admin BUMDes:"
echo -e "   - Username: ${YELLOW}admin${NC}"
echo -e "   - Password: ${YELLOW}admin123${NC}"
echo ""
echo -e "📁 Lokasi Pasar Desa: ${CYAN}/var/www/pasar-desa${NC}"
echo -e "🔄 Perintah Cek Status: ${CYAN}pm2 status${NC} (Akan muncul warungpulsa & pasar-desa)"
echo -e "📜 Cek Log Realtime:   ${CYAN}pm2 logs pasar-desa${NC}"
echo ""
echo -e "🔐 ${GREEN}JIKA INGIN MEMASANG DOMAIN TERPISAH UNTUK PASAR DESA:${NC}"
echo "1. Arahkan DNS A Record domain baru (misal: pasardesa.id) ke IP: ${SERVER_IP}"
echo "2. Edit Nginx:"
echo "   nano /etc/nginx/sites-available/pasar-desa"
echo "   (Ubah server_name _ menjadi server_name pasardesa.id www.pasardesa.id; dan listen 80;)"
echo "3. Pasang SSL gratis: certbot --nginx -d pasardesa.id -d www.pasardesa.id"
echo "=================================================================="
