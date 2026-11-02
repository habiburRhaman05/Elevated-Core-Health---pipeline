# VPS setup with PM2

Assumptions: Ubuntu VPS, repository cloned to `/opt/ech-pipeline`, DNS A records for both subdomains point to the VPS, and the app's PostgreSQL database is available.

## 1. Install dependencies and build

```bash
cd /opt/ech-pipeline
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo npm install -g pm2

cd /opt/ech-pipeline/backend
cp ../deploy/backend.env.production .env
npm ci --include=dev
npx prisma generate
npx prisma migrate deploy
npm run build

cd /opt/ech-pipeline/web-dashboard
cp ../deploy/frontend.env.production .env.production
npm ci
npm run build
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
```

Before starting, edit `backend/.env` with the real production database URL and secrets. Keep that file private. The committed env templates contain placeholders where applicable. The frontend env file must use the HTTPS URLs for `api-elevated-core-health.ghlprime.com` and `elevated-core-health.ghlprime.com`; the provided production template already does.

## 2. Start both apps with PM2

From the repository root:

```bash
cd /opt/ech-pipeline
pm2 start ecosystem.config.cjs --env production
pm2 status
pm2 logs
pm2 save
pm2 startup
```

Run the `sudo env PATH=... pm2 startup ...` command printed by `pm2 startup` so PM2 restores the apps after reboot. For later deployments, rebuild the backend and frontend, then run `pm2 reload ecosystem.config.cjs --env production`.

## 3. Configure Nginx and HTTPS

```bash
sudo cp /opt/ech-pipeline/deploy/nginx-pm2.conf /etc/nginx/sites-available/ech-pipeline
sudo ln -sfn /etc/nginx/sites-available/ech-pipeline /etc/nginx/sites-enabled/ech-pipeline
sudo nginx -t
sudo systemctl reload nginx
```

Allow inbound ports 80 and 443 in the VPS firewall/security group. Once both DNS records resolve to the VPS, issue certificates and let Certbot configure the HTTPS redirects:

```bash
sudo certbot --nginx -d elevated-core-health.ghlprime.com
sudo certbot --nginx -d api-elevated-core-health.ghlprime.com
sudo nginx -t && sudo systemctl reload nginx
```

The Nginx config proxies the frontend hostname to `127.0.0.1:3000` and the API hostname to `127.0.0.1:8080`. Keep those app ports closed to the public internet; expose only SSH, HTTP, and HTTPS.
