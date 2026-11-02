#!/bin/bash
set -euo pipefail

# ============================================================
# ECH Pipeline Portal — VPS Deployment Script
# Target: Ubuntu 22.04/24.04 LTS
# Domain: elevated-core-health.ghlprime.com (frontend)
#         api-elevated-core-health.ghlprime.com (backend)
# ============================================================

REPO_URL="https://github.com/habiburRhaman05/Elevated-Core-Health---pipeline.git"
APP_DIR="/opt/ech-pipeline"
DB_NAME="ech_pipeline"
DB_USER="ech_user"
SERVICE_USER="ech"

# ---- Required secrets (passed via environment, never hardcoded here) ----
# DB_PASS            - password to set for the new local PostgreSQL role
# NEON_HOST          - Neon hostname (for one-time data migration)
# NEON_USER          - Neon username
# NEON_PASS          - Neon password
# NEON_DBNAME        - Neon database name
#
# Source them from deploy/secrets.sh (gitignored, scp'd separately) if present:
if [ -f "${APP_DIR}/deploy/secrets.sh" ]; then
    # shellcheck disable=SC1091
    source "${APP_DIR}/deploy/secrets.sh"
fi

: "${DB_PASS:?DB_PASS is required — set it in deploy/secrets.sh}"
: "${NEON_HOST:?NEON_HOST is required — set it in deploy/secrets.sh}"
: "${NEON_USER:?NEON_USER is required — set it in deploy/secrets.sh}"
: "${NEON_PASS:?NEON_PASS is required — set it in deploy/secrets.sh}"
: "${NEON_DBNAME:?NEON_DBNAME is required — set it in deploy/secrets.sh}"

echo "============================================"
echo "  ECH Pipeline Portal — VPS Setup Starting"
echo "============================================"

# ---- 1. System update & essential packages ----
echo "[1/10] Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git build-essential ufw certbot python3-certbot-nginx

# ---- 2. Install Node.js 22 (ships directly in Ubuntu 26.04's universe repo) ----
echo "[2/10] Installing Node.js..."
apt-get install -y nodejs npm
echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# ---- 3. Install PostgreSQL (Ubuntu 26.04 ships PostgreSQL 18) ----
echo "[3/10] Installing PostgreSQL..."
apt-get install -y postgresql postgresql-contrib postgresql-client
systemctl enable postgresql
systemctl start postgresql

# ---- 4. Create PostgreSQL database & user ----
echo "[4/10] Setting up PostgreSQL database..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};"
echo "PostgreSQL database '${DB_NAME}' ready."

# ---- 5. Migrate data from Neon to local PostgreSQL ----
echo "[5/10] Migrating data from Neon PostgreSQL (Neon will NOT be modified)..."
echo "  Dumping from Neon..."
PGPASSWORD="${NEON_PASS}" pg_dump \
    --host="${NEON_HOST}" \
    --port=5432 \
    --username="${NEON_USER}" \
    --dbname="${NEON_DBNAME}" \
    --no-owner \
    --no-privileges \
    --format=custom \
    --file=/tmp/ech_neon_dump.dump \
    || { echo "WARNING: pg_dump from Neon failed. Will rely on Prisma migrations instead."; touch /tmp/ech_neon_dump_failed; }

if [ ! -f /tmp/ech_neon_dump_failed ]; then
    echo "  Restoring into local PostgreSQL..."
    PGPASSWORD="${DB_PASS}" pg_restore \
        --host=localhost \
        --port=5432 \
        --username="${DB_USER}" \
        --dbname="${DB_NAME}" \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        /tmp/ech_neon_dump.dump \
        || echo "WARNING: pg_restore had some warnings (likely fine for first run)."
    echo "  Data migration from Neon complete!"
    rm -f /tmp/ech_neon_dump.dump
else
    echo "  Skipping restore — will use Prisma migrations to set up schema."
    rm -f /tmp/ech_neon_dump_failed
fi

# ---- 6. Create service user & clone repository ----
echo "[6/10] Setting up application..."
id -u ${SERVICE_USER} &>/dev/null || useradd --system --shell /bin/bash --home ${APP_DIR} ${SERVICE_USER}
mkdir -p ${APP_DIR}

if [ -d "${APP_DIR}/.git" ]; then
    echo "  Repo already cloned, pulling latest..."
    cd ${APP_DIR}
    git pull origin main
else
    echo "  Cloning repository..."
    git clone ${REPO_URL} ${APP_DIR}
fi

# ---- 7. Build backend ----
echo "[7/10] Building backend..."
cd ${APP_DIR}/backend

# Copy production env
cp ${APP_DIR}/deploy/backend.env.production ${APP_DIR}/backend/.env

npm install --include=dev
npx prisma generate
npx prisma migrate deploy
npm run build

# ---- 8. Build frontend ----
echo "[8/10] Building frontend..."
cd ${APP_DIR}/web-dashboard

# Copy production env (needed at build time for NEXT_PUBLIC_ vars)
cp ${APP_DIR}/deploy/frontend.env.production ${APP_DIR}/web-dashboard/.env.production
cp ${APP_DIR}/deploy/frontend.env.production ${APP_DIR}/web-dashboard/.env

npm install
npm run build

# Copy static assets into standalone output
cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true

# ---- 9. Set permissions & install services ----
echo "[9/10] Setting up systemd services..."
chown -R ${SERVICE_USER}:${SERVICE_USER} ${APP_DIR}

# Copy systemd service files
cp ${APP_DIR}/deploy/ech-backend.service /etc/systemd/system/
cp ${APP_DIR}/deploy/ech-frontend.service /etc/systemd/system/

systemctl daemon-reload
systemctl enable ech-backend ech-frontend
systemctl restart ech-backend
sleep 3
systemctl restart ech-frontend

echo "  Backend status: $(systemctl is-active ech-backend)"
echo "  Frontend status: $(systemctl is-active ech-frontend)"

# ---- 10. Install & configure Nginx ----
echo "[10/10] Configuring Nginx..."
apt-get install -y nginx

# Remove default config
rm -f /etc/nginx/sites-enabled/default

# Copy our configs
cp ${APP_DIR}/deploy/nginx-api.conf /etc/nginx/sites-available/api-ech.conf
cp ${APP_DIR}/deploy/nginx-frontend.conf /etc/nginx/sites-available/frontend-ech.conf

# For initial setup, use HTTP-only configs (before SSL certs exist)
# We'll write temporary HTTP-only versions
cat > /etc/nginx/sites-available/api-ech-temp.conf <<'NGINX_API_TEMP'
server {
    listen 80;
    server_name api-elevated-core-health.ghlprime.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
NGINX_API_TEMP

cat > /etc/nginx/sites-available/frontend-ech-temp.conf <<'NGINX_FE_TEMP'
server {
    listen 80;
    server_name elevated-core-health.ghlprime.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_FE_TEMP

# Enable temp HTTP configs first
ln -sf /etc/nginx/sites-available/api-ech-temp.conf /etc/nginx/sites-enabled/api-ech.conf
ln -sf /etc/nginx/sites-available/frontend-ech-temp.conf /etc/nginx/sites-enabled/frontend-ech.conf

mkdir -p /var/www/certbot

nginx -t && systemctl restart nginx

# ---- 11. SSL certificates via Let's Encrypt ----
echo "[BONUS] Requesting SSL certificates..."
echo "  Make sure DNS A records point to this server before running certbot!"
echo ""
echo "  Run these commands manually after DNS is propagated:"
echo ""
echo "    certbot --nginx -d api-elevated-core-health.ghlprime.com --non-interactive --agree-tos -m habib.octopidigital@gmail.com"
echo "    certbot --nginx -d elevated-core-health.ghlprime.com --non-interactive --agree-tos -m habib.octopidigital@gmail.com"
echo ""
echo "  Or run them now if DNS is ready:"

# Try to get SSL certs (will fail gracefully if DNS isn't pointed yet)
certbot --nginx -d api-elevated-core-health.ghlprime.com --non-interactive --agree-tos -m habib.octopidigital@gmail.com || echo "  SSL for API domain failed — DNS may not be pointed yet. Run certbot manually later."
certbot --nginx -d elevated-core-health.ghlprime.com --non-interactive --agree-tos -m habib.octopidigital@gmail.com || echo "  SSL for frontend domain failed — DNS may not be pointed yet. Run certbot manually later."

# Set up auto-renewal
systemctl enable certbot.timer 2>/dev/null || true

# ---- 12. Firewall ----
echo "Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "============================================"
echo "  DEPLOYMENT COMPLETE!"
echo "============================================"
echo ""
echo "  Frontend: https://elevated-core-health.ghlprime.com"
echo "  API:      https://api-elevated-core-health.ghlprime.com"
echo ""
echo "  Services:"
echo "    systemctl status ech-backend"
echo "    systemctl status ech-frontend"
echo "    journalctl -u ech-backend -f   # backend logs"
echo "    journalctl -u ech-frontend -f  # frontend logs"
echo ""
echo "  Database:"
echo "    sudo -u postgres psql -d ${DB_NAME}"
echo ""
echo "  IMPORTANT: Make sure DNS A records for both subdomains"
echo "  point to this server's IP. Then run certbot if SSL"
echo "  wasn't obtained automatically."
echo "============================================"
