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
