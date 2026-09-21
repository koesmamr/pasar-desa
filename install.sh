#!/usr/bin/env bash
# ==============================================================================
# AUTOINSTALL SCRIPT: PASAR DESA NUSANTARA (GOOGLE SSO & MULTI-APP READY)
# Target OS: Ubuntu 24.04 LTS / Ubuntu 22.04 LTS
# Mengadopsi Pola Google SSO & Kompatibel Penuh Berdampingan dengan Warung Pulsa
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
echo "              Terintegrasi Resmi dengan Google SSO                "
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

# 2. Deteksi Lingkungan VPS (Cek Warung Pulsa)
echo -e "${YELLOW}==> Memeriksa lingkungan server...${NC}"
HAS_WARUNGPULSA=false
if [ -d "/var/www/warungpulsa" ] || [ -f "/etc/nginx/sites-available/warungpulsa" ]; then
    HAS_WARUNGPULSA=true
    echo -e "${GREEN}[INFO] Terdeteksi aplikasi Warung Pulsa di VPS ini.${NC}"
    echo -e "${GREEN}Pasar Desa akan dipasang di Port ${APP_PORT} (terisolasi) agar Warung Pulsa tetap aman 100%.${NC}"
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

# Siapkan direktori data SQLite
mkdir -p "$APP_DIR/data"

# Siapkan file .env dengan konfigurasi Google SSO
echo -e "${YELLOW}==> [6/7] Menyiapkan konfigurasi .env & Google SSO...${NC}"
if [ ! -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    sed -i "s/PORT=3000/PORT=3001/g" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
else
    # Pastikan variabel Google SSO ada di file .env jika sebelumnya belum ada
    if ! grep -q "GOOGLE_CLIENT_ID" "$APP_DIR/.env"; then
        echo 'GOOGLE_CLIENT_ID="857800648920-ue7akumho3f7ie9e0ir102goqvceji6d.apps.googleusercontent.com"' >> "$APP_DIR/.env"
    else
        sed -i 's/727817597785-oub85kbvvsl640v7q4cak661vn5jt7kh.apps.googleusercontent.com/857800648920-ue7akumho3f7ie9e0ir102goqvceji6d.apps.googleusercontent.com/g' "$APP_DIR/.env"
    fi
    if ! grep -q "ADMIN_EMAIL" "$APP_DIR/.env"; then
        echo 'ADMIN_EMAIL="syamsul18782@gmail.com"' >> "$APP_DIR/.env"
    fi
fi

# 7. Konfigurasi Nginx Reverse Proxy Multi-Site Aman
echo -e "${YELLOW}==> [7/7] Mengonfigurasi Nginx Reverse Proxy Pasar Desa (Port ${APP_PORT})...${NC}"

DESA_DOMAIN="${DOMAIN:-dutohe.bintangcod.com}"

if [ "$HAS_WARUNGPULSA" = true ]; then
    echo "Terdeteksi Warung Pulsa. Mengonfigurasi Pasar Desa untuk domain ($DESA_DOMAIN) pada Port 80 dan Port 8080..."
    cat > /etc/nginx/sites-available/pasar-desa << EOF
# 1. Akses via Domain Resmi (Port 80)
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

# 2. Akses Alternatif via Port 8080 (IP Langsung & Domain)
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
    cat > /etc/nginx/sites-available/pasar-desa << EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    listen 8080;
    server_name $DESA_DOMAIN www.$DESA_DOMAIN _;

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

# Aktifkan site pasar-desa di Nginx
ln -sf /etc/nginx/sites-available/pasar-desa /etc/nginx/sites-enabled/pasar-desa
nginx -t && systemctl restart nginx

# 8. Menjalankan Aplikasi via PM2
echo -e "${YELLOW}==> Menjalankan Pasar Desa via PM2 Process Manager...${NC}"
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

SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "IP_VPS_ANDA")

echo ""
echo -e "${GREEN}=================================================================="
echo "    🎉 INSTALASI PASAR DESA NUSANTARA BERHASIL SELESAI!          "
echo "==================================================================${NC}"
echo ""

if [ "$HAS_WARUNGPULSA" = true ]; then
    echo -e "${MAGENTA}🔍 STATUS DUA APLIKASI DI VPS INI:${NC}"
    echo -e "   1. 🏪 Warung Pulsa:  ${CYAN}http://${SERVER_IP}${NC} (Port 3000 - Tetap Normal & Tidak Terganggu)"
    echo -e "   2. 🌾 Pasar Desa:    ${CYAN}http://${SERVER_IP}:8080${NC} (Port 3001)"
    echo -e "      🏛️ Admin BUMDes:  ${CYAN}http://${SERVER_IP}:8080/admin${NC}"
else
    echo -e "🌐 Website Pasar Desa aktif di:  ${CYAN}http://${SERVER_IP}${NC} atau ${CYAN}http://${SERVER_IP}:8080${NC}"
    echo -e "🏛️ Panel Admin BUMDes di:        ${CYAN}http://${SERVER_IP}/admin${NC}"
fi

echo ""
echo -e "🔑 ${YELLOW}METODE LOGIN RESMI: GOOGLE SSO (1-KLIK MASUK)${NC}"
echo -e "   - Akun Google Super Admin: ${GREEN}syamsul18782@gmail.com${NC}"
echo -e "   - Cukup klik tombol 'Sign in with Google' di halaman /admin"
echo -e "   - Alternatif Login Manual: ${CYAN}admin${NC} / ${CYAN}admin123${NC}"
echo ""
echo -e "📁 Lokasi Pasar Desa: ${CYAN}/var/www/pasar-desa${NC}"
echo -e "⚙️ File Pengaturan:    ${CYAN}nano /var/www/pasar-desa/.env${NC}"
echo -e "🔄 Perintah Status:    ${CYAN}pm2 status${NC} (Akan tampil warungpulsa & pasar-desa)"
echo -e "📜 Cek Log Realtime:   ${CYAN}pm2 logs pasar-desa${NC}"
echo ""
echo -e "🔐 ${GREEN}PANDUAN GOOGLE OAUTH & DOMAIN HTTPS:${NC}"
echo "1. Pastikan domain atau IP VPS Anda didaftarkan di Google Cloud Console:"
echo "   (Menu APIs & Services -> Credentials -> OAuth 2.0 Client -> Authorized JavaScript origins)"
echo "   Tambahkan: http://${SERVER_IP}:8080 dan domain desa Anda jika sudah ada."
echo "2. Pasang SSL Gratis jika domain sudah siap:"
echo "   certbot --nginx -d pasardesa.id -d www.pasardesa.id"
echo "=================================================================="
