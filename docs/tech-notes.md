# Nginx Configuration Explained

## nginx.conf — Global Nginx Settings

This file controls **how Nginx runs** (processes, logging, compression). It does NOT control routing.

### Block 1: Worker Processes
```
worker_processes auto;
```
**Purpose:** How many processes handle requests.
- `auto` = one process per CPU core (recommended)
- 4 cores → 4 processes → 4× more traffic capacity

### Block 2: Events
```
events {
    worker_connections 1024;
}
```
**Purpose:** Max simultaneous connections per worker.
- Each worker handles up to 1,024 connections
- 4 workers × 1,024 = 4,096 total connections

### Block 3: HTTP Settings
Wraps all HTTP config. Everything inside only applies to HTTP traffic.

#### 3a. File Types
```
include /etc/nginx/mime.types;
default_type application/octet-stream;
```
**Purpose:** Map file extensions to content types.
- `.html` → `text/html` → browser renders as page
- `.js` → `application/javascript` → browser executes as script
- Unknown → `application/octet-stream` → browser downloads

#### 3b. Logging
```
log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                '$status $body_bytes_sent "$http_referer" '
                '"$http_user_agent"';

access_log /var/log/nginx/access.log main;
error_log  /var/log/nginx/error.log warn;
```
**Purpose:** Define log format and destinations.
- `access_log` = every request
- `error_log warn` = only warnings and errors

**Variable meanings:**
| Variable | Meaning | Example |
|----------|---------|---------|
| `$remote_addr` | User's IP | `192.168.1.1` |
| `$remote_user` | Logged-in username | `-` (none) |
| `$time_local` | When request happened | `[02/Sep/2026:15:01:33]` |
| `$request` | Full request line | `GET /api/health HTTP/1.1` |
| `$status` | Response code | `200` |
| `$body_bytes_sent` | Bytes sent back | `45` |
| `$http_referer` | Page user came from | `-` |
| `$http_user_agent` | User's browser | `Mozilla/5.0...` |

**Example log line:**
```
192.168.1.1 - - [02/Sep/2026:15:01:33] "GET /api/health HTTP/1.1" 200 45 "-" "Mozilla/5.0"
```

#### 3c. Performance
```
sendfile        on;
tcp_nopush      on;
keepalive_timeout 65;
```
**Purpose:** Faster responses.

| Setting | What it does |
|---------|--------------|
| `sendfile on` | Kernel-level file copy (faster static files) |
| `tcp_nopush on` | Bundles response packets (fewer round-trips) |
| `keepalive_timeout 65` | Keeps connections open 65s (reusable, faster) |

#### 3d. Compression
```
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml;
```
**Purpose:** Compress responses before sending.
- 100KB JSON → ~20KB after gzip
- Only text-based types (images don't benefit)

#### 3e. Load Site Configs
```
include /etc/nginx/conf.d/*.conf;
```
**Purpose:** Pull in routing rules from `conf.d/` folder.
- This is how `default.conf` gets loaded
- Drop more `.conf` files there → Nginx picks them up

### Visual Summary of nginx.conf
```
┌─────────────────────────────────────────────┐
│ NGINX.CONF                                  │
│  Process management: worker_processes auto  │
│  Connection limits: worker_connections 1024 │
│                                            │
│  http {                                     │
│    MIME types (file extensions)             │
│    Logging (access.log + error.log)         │
│    Performance (sendfile, keepalive)        │
│    Compression (gzip)                       │
│    include conf.d/*.conf  ← loads routing  │
│  }                                          │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ CONF.D/DEFAULT.CONF                         │
│  Define services (frontend, backend)        │
│  Route requests by URL path                 │
│  /api/* → backend                          │
│  /*    → frontend                          │
└─────────────────────────────────────────────┘
```

**In short:**
- `nginx.conf` = the "engine" config (how Nginx runs: processes, logging, compression)
- `default.conf` = the "brain" config (what traffic goes where)

---

## default.conf — Routing Rules

This file controls **where requests go** based on URL path.

### Block 1: Service Definitions (Upstreams)
```
upstream frontend {
    server frontend:3000;
}

upstream backend {
    server backend:4000;
}
```
**Purpose:** Define which services exist and where they're located.

- `upstream frontend` = "there's a service called frontend"
- `server frontend:3000` = "it's at hostname 'frontend' on port 3000"
- Docker resolves `frontend` to the container's IP address

### Block 2: HTTP Server
```
server {
    listen 80;
    server_name _;
    ...
}
```
**Purpose:** Start a server listening on port 80 (HTTP).

- `listen 80` = accept connections on port 80
- `server_name _` = catch-all for any domain name

### Block 3: Static Assets Rule
```
location /_next/static/ {
    proxy_pass http://frontend;
    proxy_cache_valid 200 365d;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```
**Purpose:** Cache Next.js static files aggressively.

- `location /_next/static/` = match URLs starting with this path
- `proxy_pass http://frontend` = forward to the frontend container
- `proxy_cache_valid 200 365d` = cache successful responses for 1 year
- `Cache-Control` header tells browsers to cache too

**Why?** Static assets (JS, CSS, images) rarely change. Caching them = faster page loads.

### Block 4: API Routes Rule
```
location /api/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
**Purpose:** Forward API calls to the Express backend.

- `location /api/` = match URLs starting with `/api/`
- `proxy_pass http://backend` = forward to backend container
- The `proxy_set_header` lines pass user info:
  - `Host` = original domain name
  - `X-Real-IP` = user's real IP address
  - `X-Forwarded-For` = chain of proxies (for debugging)
  - `X-Forwarded-Proto` = whether request was HTTP or HTTPS

**Why?** Backend needs to know who's making requests for logging/security.

### Block 5: Catch-All Rule
```
location / {
    proxy_pass http://frontend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
**Purpose:** Send everything else to the frontend.

- `location /` = match any URL that doesn't match previous rules
- `proxy_pass http://frontend` = forward to Next.js

**Why?** Next.js handles page routing, so all non-API/non-static requests go here.

### Visual Summary of default.conf
```
Request: GET /api/health
          ↓
    Match: location /api/
          ↓
    proxy_pass → backend:4000
          ↓
    Response back to user


Request: GET /_next/static/chunk.js
          ↓
    Match: location /_next/static/
          ↓
    proxy_pass → frontend:3000
          ↓
    Response cached for 1 year
          ↓
    Response back to user


Request: GET /
          ↓
    Match: location / (catch-all)
          ↓
    proxy_pass → frontend:3000
          ↓
    Response back to user
```

### Why This Order Matters

Nginx processes rules **top to bottom**:

1. `/_next/static/` — most specific (longest path)
2. `/api/` — second most specific
3. `/` — catch-all (shortest path)

If `/` were first, it would catch ALL requests and nothing else would work.

### Why Headers Matter

| Header | Purpose |
|--------|---------|
| `Host $host` | Backend knows which domain was requested |
| `X-Real-IP $remote_addr` | Backend knows user's real IP |
| `X-Forwarded-For` | Shows chain of proxies (useful for debugging) |
| `X-Forwarded-Proto` | Backend knows if request was HTTP or HTTPS |

Without these, the backend would think all requests come from Nginx's IP (127.0.0.1).

---

## Summary

| File | Controls | Like a... |
|------|----------|-----------|
| `nginx.conf` | How Nginx runs | Engine settings |
| `default.conf` | Where traffic goes | Traffic cop |

---

# Certbot Explained

## What is Certbot?

**Certbot** is a tool that automatically gets and manages **SSL/TLS certificates** from **Let's Encrypt** — a free certificate authority.

## What Certbot does in our stack

```
┌─────────────────────────────────────────────────────────┐
│  certbot container (runs forever in background)          │
│                                                          │
│  1. On first setup:                                      │
│     - Requests a certificate from Let's Encrypt          │
│     - Proves you own the domain (via nginx webroot)      │
│     - Saves cert to ./nginx/certbot/conf/                │
│                                                          │
│  2. Every 12 hours:                                      │
│     - Checks if cert is expiring (90-day lifetime)       │
│     - Renews automatically if needed                     │
│     - Nginx picks up the new cert                        │
└─────────────────────────────────────────────────────────┘
```

## The entrypoint command explained

```yaml
entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
```

This is a **loop** that:
1. Runs `certbot renew` — checks if cert needs renewal
2. Sleeps 12 hours
3. Repeats forever

## How it connects to nginx

- **`./nginx/certbot/conf`** → mounted into nginx as `/etc/letsencrypt` (where nginx reads certs)
- **`./nginx/certbot/www`** → mounted into nginx as `/var/www/certbot` (where Let's Encrypt verifies domain ownership)

## The flow

```
User visits https://footplay.com
        ↓
Nginx (port 443) → uses SSL cert from ./nginx/certbot/conf
        ↓
Cert expires in 90 days
        ↓
Certbot auto-renews → saves new cert → nginx reloads
```

---


# Deployment Guide

This guide covers deploying the Foot-Play game to Oracle Cloud Free Tier.

## Prerequisites

1. **Oracle Cloud Free Tier account** — [sign up here](https://www.oracle.com/cloud/free/)
2. **A domain name** — for HTTPS (e.g., `footplay.example.com`)
3. **SSH key pair** — Ed25519 or RSA (`ssh-keygen -t ed25519 -C "your-email@example.com"` you should have both `id_ed25519` and `id_ed25519.pub`)
4. **GitHub repository** — with the code pushed

---

## Step 1: Create Oracle Cloud Instance

1. Log into Oracle Cloud Console
2. Go to **Compute → Instances → Create Instance**
3. **Basic Information**:
   - **Name**: `foot-play-server`
4. **Security**:
   - Skip shielded instances and confidential computing
5. **Networking**:
   - Select **"Create new virtual cloud network"**
   - Use defaults (VCN name, CIDR, subnet)
6. **Storage**:
   - Use defaults (Boot volume: 50 GB)
7. **Review → Create**

### Attach Public IP

After instance is created:
1. Click on the instance → **Primary VNIC** link
2. Go to **IP Administration** tab
3. Click on the **Primary IP** row → **Edit**
4. Under **"Public IP type"** → select **"Ephemeral public IP"**
5. **Save**

### Configure Security Rules

1. In the top search bar, type **"VCN"** → **"Virtual Cloud Networks"**
2. Click your VCN name: **`foot-play-server-vcn`**
3. Under **Related Resources** → click **"Security Lists"**
4. Click **"Default Security List for foot-play-server-vcn"**
5. Click **"Add Ingress Rules"** and add:

| Source CIDR | Destination Port | Description |
|-------------|------------------|-------------|
| 0.0.0.0/0 | 22 | SSH |
| 0.0.0.0/0 | 80 | HTTP |
| 0.0.0.0/0 | 443 | HTTPS |

**Note:** Port 22 is usually open by default. You only need to add 80 and 443.

---

## Step 2: Connect via SSH

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@YOUR_PUBLIC_IP
```

**Note:** If you used a different key name during Oracle Cloud setup, replace `id_ed25519` with your key name.

---

## Step 3: Run Provisioning Script

On the server:

```bash
# Clone the repo
git clone https://github.com/ricardoliveira5ro/foot-play.git ~/foot-play

# Enter the directory
cd ~/foot-play

# Make provisioning script executable
chmod +x scripts/provision-oracle.sh

# Run it
sudo bash scripts/provision-oracle.sh
```

---

## Step 4: Configure Environment

```bash
cd ~/foot-play
nano .env.production
```

Set real values:

```env
DB_NAME=
DB_USER=
DB_PASSWORD=
PLAYER_TOKEN_SECRET=
```

Generate a random secret:
```bash
openssl rand -hex 32
```

---

## Step 5: Start the Stack

```bash
cd ~/foot-play
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Verify:
```bash
curl http://localhost/api/health
```

---

## Step 6: Set Up DNS

1. Go to your domain registrar (or Cloudflare)
2. Create an **A record**:
   - **Name**: `footplay` (or `@` for root)
   - **Value**: YOUR_SERVER_PUBLIC_IP
   - **TTL**: 300 (5 min)

---

## Step 7: Set Up SSL (HTTPS)

After DNS is pointing to your server:

```bash
# Request certificate
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm certbot certonly --webroot -w /var/www/certbot -d YOUR_DOMAIN.com
```

Then update `nginx/conf.d/default.conf`:
- Uncomment the HTTPS server block
- Replace `your-domain.com` with your actual domain
- Uncomment the HTTP → HTTPS redirect

Restart nginx:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production restart nginx
```

---

## Step 8: Set Up CI/CD

1. In GitHub repo: **Settings → Secrets and variables → Actions**
2. Add secrets:

| Secret | Value |
|--------|-------|
| `DEPLOY_HOST` | YOUR_SERVER_PUBLIC_IP |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_KEY` | Your SSH private key content |
| `DATABASE_URL` | `postgresql://[USER]:[PASSWORD]@localhost:5432/[NAME]` |

3. Push to `main` — the pipeline runs automatically

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Permission denied (publickey)` | Make sure you're using the correct private key |
| `port 5432 already in use` | Local PostgreSQL running — stop it or remove port mapping |
| `host not found in upstream` | Frontend/backend containers not running — check `sudo docker compose ps` |
| `EAI_AGAIN` in frontend | Set `HOSTNAME=0.0.0.0` in frontend Dockerfile |
| SSL cert not renewing | Check certbot logs: `sudo docker compose logs certbot` |
| Health check failing | Backend can't reach DB — check `DATABASE_URL` in `.env.production` |
