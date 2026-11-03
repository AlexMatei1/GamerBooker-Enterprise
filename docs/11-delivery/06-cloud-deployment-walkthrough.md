# Production Cloud VPS Deployment Walkthrough — GamerBooker Enterprise v1.0

This guide walks you through deploying the complete GamerBooker Enterprise suite to a live cloud Virtual Private Server (VPS) with SSL certificates, automated database migrations, and GitHub Actions continuous deployment.

---

## Architecture Overview

```
                                      INTERNET
                                          │
                            ┌─────────────┴─────────────┐
                            │ Cloudflare / Let's Encrypt│
                            │      SSL / TLS (443)      │
                            └─────────────┬─────────────┘
                                          │
                           Port 80 / 443  ▼
                    ┌─────────────────────────────────────────┐
                    │      Global Edge Gateway (Nginx)        │
                    │         (gamerbooker_prod_gateway)      │
                    └────┬─────────────────┬────────────────┬─┘
                         │                 │                │
            /v1/, /docs/ │      /dashboard/│                │ / (default)
                         ▼                 ▼                ▼
             ┌─────────────────┐ ┌───────────────────┐ ┌─────────────────┐
             │   NestJS API    │ │  Venue Dashboard  │ │   Mobile App    │
             │   (Port 3000)   │ │    (Port 5173)    │ │   (Port 5174)   │
             └────────┬────────┘ └───────────────────┘ └─────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌──────────────┐            ┌──────────────┐
│ PostgreSQL 16│            │   Redis 7    │
│ (Port 5432)  │            │ (Port 6379)  │
└──────────────┘            └──────────────┘
```

---

## Step 1: Provision a Cloud Virtual Server

Recommended Specifications:
* **OS:** Ubuntu 24.04 LTS (x86_64)
* **CPU:** 2 vCPUs (or 4 vCPUs for large tournaments)
* **RAM:** 4 GB RAM (minimum)
* **Storage:** 40 GB NVMe SSD
* **Recommended Providers:**
  * **Hetzner Cloud:** Server type `CPX21` (~€7.50 / month in Falkenstein/Nuremberg) — *Best price-to-performance*.
  * **DigitalOcean:** Basic Droplet with 4GB RAM ($24 / month).
  * **AWS EC2:** `t4g.medium` or `t3.medium`.

---

## Step 2: Server Hardening & Docker Installation

SSH into your freshly provisioned server:
```bash
ssh root@YOUR_SERVER_IP
```

Update packages and install the Docker Engine & Compose plugin:
```bash
# 1. Update system packages
apt update && apt upgrade -y
apt install -y curl git ufw fail2ban jq

# 2. Configure Firewall (allow SSH, HTTP, and HTTPS)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 3. Install Docker official repository
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 4. Verify Docker Compose
docker compose version
```

---

## Step 3: Configure DNS Records

In your domain registrar (e.g. Cloudflare, Namecheap, Rotld):
Create **A Records** pointing to your `YOUR_SERVER_IP`:

| Type | Name / Host | Target IP | Proxy Status (Cloudflare) |
|---|---|---|---|
| `A` | `@` (or `gamerbooker.ro`) | `YOUR_SERVER_IP` | Proxied (Orange Cloud) |
| `A` | `app` | `YOUR_SERVER_IP` | Proxied (Orange Cloud) |
| `A` | `dashboard` | `YOUR_SERVER_IP` | Proxied (Orange Cloud) |
| `A` | `api` | `YOUR_SERVER_IP` | Proxied (Orange Cloud) |

> **Pro Tip:** Enabling Cloudflare Proxy gives you instant free SSL/TLS, DDoS mitigation, and global edge CDN caching for all static frontend assets.

---

## Step 4: Clone & Deploy the Stack

Create the deployment directory and clone the repository:
```bash
mkdir -p /opt/gamerbooker
cd /opt/gamerbooker

# Clone your repository
git clone https://github.com/YOUR_ORGANIZATION/GamerBooker_Enterprise_v1.0.git .

# Create your production environment file
cp .env.production.example .env
nano .env
```

### Essential `.env` Settings:
* `POSTGRES_PASSWORD`: Choose a secure 32+ character random string.
* `REDIS_PASSWORD`: Choose a secure random string.
* `MFA_SECRET_KEY`: Generate a 64-character hex string (e.g., using `openssl rand -hex 32`).
* `STRIPE_SECRET_KEY`: Add your live `sk_live_...` key.
* `STRIPE_WEBHOOK_SECRET`: Add your live `whsec_...` key.

### Launch the Cluster:
```bash
# Make deploy script executable and run
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

The script will:
1. Build the production multi-stage images for Backend, Dashboard, and Mobile App.
2. Spin up PostgreSQL 16 and Redis 7 and wait for health checks.
3. Automatically execute all 32 database migrations (`node db/migrate.js`).
4. Seed initial arena data (Nexus Gaming Arena Bucharest).
5. Launch the Nginx Edge Gateway.

---

## Step 5: Verify the Deployment

Check that all 6 containers are healthy and running:
```bash
docker compose -f docker-compose.prod.yml ps
```

Expected output:
```
NAME                          STATUS                    PORTS
gamerbooker_prod_gateway      Up                        0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
gamerbooker_prod_backend      Up (healthy)              0.0.0.0:3000->3000/tcp
gamerbooker_prod_dashboard    Up                        0.0.0.0:5173->80/tcp
gamerbooker_prod_mobile       Up                        0.0.0.0:5174->80/tcp
gamerbooker_prod_postgres     Up (healthy)              0.0.0.0:5432->5432/tcp
gamerbooker_prod_redis        Up (healthy)              0.0.0.0:6379->6379/tcp
```

Test the live endpoints via `curl`:
```bash
# 1. Edge Gateway Health
curl http://localhost/health

# 2. Backend OpenAPI Docs
curl -I http://localhost/docs/

# 3. Mobile Web App
curl -I http://localhost/
```

---

## Step 6: Automated GitHub Actions CI/CD Setup

To enable automatic zero-downtime deployments every time code is pushed to `main`:

1. **Generate a Dedicated Deploy SSH Key on your Server:**
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-gamerbooker" -f ~/.ssh/github_deploy -N ""
   cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

2. **Add GitHub Repository Secrets:**
   In your GitHub repository, navigate to **Settings $\rightarrow$ Secrets and variables $\rightarrow$ Actions** and add:

   | Secret Name | Value |
   |---|---|
   | `SSH_HOST` | `YOUR_SERVER_IP` |
   | `SSH_USER` | `root` (or a dedicated deploy user) |
   | `SSH_KEY` | Contents of `cat ~/.ssh/github_deploy` (private key) |
   | `APP_URL` | `https://gamerbooker.ro` |

3. **Push to `main`:**
   GitHub Actions will automatically run the 42 test suites, build the Docker images, SSH into your server, pull the latest commits, apply any new migrations, and restart the containers with zero downtime!

---

## Step 7: Ongoing Maintenance & Backups

### Automated Database Backups (Cron):
Set up daily automated backups of your PostgreSQL database:
```bash
crontab -e
```
Add this daily cron job (runs every night at 03:00 AM):
```cron
0 3 * * * docker compose -f /opt/gamerbooker/docker-compose.prod.yml exec -T postgres pg_dump -U postgres gamerbooker_prod | gzip > /opt/gamerbooker/backups/gb_backup_$(date +\%F).sql.gz
```

### Viewing Container Logs:
```bash
# Stream backend logs
docker compose -f docker-compose.prod.yml logs -f backend

# Stream edge gateway access logs
docker compose -f docker-compose.prod.yml logs -f gateway
```
