# Development 6: Docker, CI/CD & Deploy

**Status**: `ready for implementation`
**Source**: `docs/v0.1/plan-v1.0-decomposition.md` (Development 6)
**Estimated Effort**: M (3-5 days)

---

## Objective

Package the full application stack for production deployment. By the end of this development, the Missing Eleven game is accessible at a public URL over HTTPS, deployed to Oracle Cloud Free Tier, with automated CI/CD via GitHub Actions. Docker images are ARM64-compatible for the Oracle Ampere A1 instance.

---

## Approach

**Docker strategy**: Multi-stage Dockerfiles for frontend and backend to minimize image size. Frontend uses Next.js standalone output. Both images built for `linux/arm64`.

**Production stack**: Five services managed by `docker-compose.yml`:
1. `frontend` — Next.js standalone server (port 3000)
2. `backend` — Express API (port 4000)
3. `postgres` — PostgreSQL 16 (internal port 5432)
4. `nginx` — Reverse proxy (port 80/443 → frontend, /api/* → backend)
5. `certbot` — Let's Encrypt SSL certificate management (auto-renewal)

**Nginx**: Reverse proxy serving frontend at `/`, proxying `/api/*` to backend. Static assets cached with far-future expiry. SSL termination with Let's Encrypt.

**CI/CD pipeline**: GitHub Actions triggered on push to `main`:
1. Build ARM64 Docker images
2. Run linting
3. SSH into Oracle Cloud → pull updated images → run migrations → restart services → health check

**Oracle Cloud provisioning**: Script to set up Ampere A1 instance with Docker + Docker Compose + firewall + repo clone + stack startup.

---

## Detailed Tasks

### Task 6.1: Create ARM64 Dockerfile for frontend

- **Description**: Multi-stage Dockerfile for Next.js standalone production build.
- **Files to create/modify**:
  - `frontend/Dockerfile` — multi-stage build
  - `frontend/next.config.js` — add `output: 'standalone'`
- **Dockerfile stages**:
  1. `deps`: `node:20-alpine`, `npm ci --only=production`
  2. `build`: Copy deps + source, `npm run build`
  3. `runner`: Copy `.next/standalone`, `public`, `.next/static`. `CMD ["node", "server.js"]`
- **Acceptance criteria**:
  - [ ] `frontend/next.config.js` includes `output: 'standalone'`
  - [ ] `docker build --platform linux/arm64 -t footplay-frontend ./frontend` succeeds
  - [ ] Image size < 200 MB
  - [ ] Container starts and responds on port 3000
- **Validation**: Build and run container locally. Verify home page loads.

### Task 6.2: Create ARM64 Dockerfile for backend

- **Description**: Multi-stage Dockerfile for Express + Prisma.
- **Files to create/modify**:
  - `backend/Dockerfile` — multi-stage build
- **Dockerfile stages**:
  1. `deps`: `node:20-alpine`, `npm ci --only=production`
  2. `build`: Copy deps + source, `npx prisma generate`, `npm run build`
  3. `runner`: Copy `dist`, `node_modules`, `prisma`, `package.json`. `CMD ["node", "dist/index.js"]`
- **Acceptance criteria**:
  - [ ] `docker build --platform linux/arm64 -t footplay-backend ./backend` succeeds
  - [ ] Image size < 300 MB
  - [ ] Container starts and responds on port 4000
- **Validation**: Build and run locally, verify health endpoint.

### Task 6.3: Create Nginx configuration

- **Description**: Production reverse proxy configuration.
- **Files to create/modify**:
  - `nginx/nginx.conf` — full config
  - `nginx/conf.d/default.conf` — site config
- **Nginx behavior**:
  - HTTP (80) → redirect to HTTPS (301)
  - HTTPS (443) → proxy `/` to frontend:3000, `/api/` to backend:4000
  - Static assets `/_next/static/` → cache 365 days
  - SSL certs from Let's Encrypt via certbot
- **Acceptance criteria**:
  - [ ] Nginx config valid: `nginx -t`
  - [ ] Frontend at `/`, API at `/api/matches/random`
  - [ ] Static assets have cache headers
  - [ ] HTTP → HTTPS redirect works
- **Validation**: `docker compose up nginx`, test routing.

### Task 6.4: Create production docker-compose.yml

- **Description**: Production Compose file wiring all services with environment variables.
- **Files to create/modify**:
  - `docker-compose.yml` (or `docker-compose.prod.yml`)
- **Services**: frontend (build ./frontend), backend (build ./backend, depends on postgres), postgres (postgres:16-alpine), nginx (nginx:alpine, ports 80:80 443:443), certbot (certbot/certbot)
- **Acceptance criteria**:
  - [ ] `docker compose up -d` starts all services
  - [ ] Frontend at `http://localhost:80`
  - [ ] API at `http://localhost/api/health`
  - [ ] Services restart on failure (restart: unless-stopped)
- **Validation**: `docker compose up -d` on fresh machine. Test web access.

### Task 6.5: Create GitHub Actions CI/CD pipeline

- **Description**: Automate build, test, and deploy on push to `main`.
- **Files to create/modify**:
  - `.github/workflows/deploy.yml` — CI/CD workflow
- **Workflow**: Build (Docker Buildx + ARM64 images + lint) → Deploy (SSH into Oracle Cloud, git pull, docker compose up -d)
- **Secrets**: DEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY, DATABASE_URL
- **Acceptance criteria**:
  - [ ] Workflow appears in GitHub Actions tab
  - [ ] `npm run lint` passes in CI
  - [ ] Docker images build in CI
  - [ ] SSH deploy executes without errors
- **Validation**: Push to main, monitor GitHub Actions run.

### Task 6.6: Oracle Cloud Free Tier provisioning + SSL setup

- **Description**: Document and execute Oracle Cloud setup.
- **Files to create/modify**:
  - `scripts/provision-oracle.sh` — setup script
  - `docs/deployment.md` — deployment guide
- **Steps**: Create Oracle Free Tier account → Launch ARM instance (Ubuntu 22.04) → Configure security (ports 22, 80, 443) → Run provision script (Docker + Compose + repo clone + stack start) → Set DNS A record → Run certbot for SSL
- **Acceptance criteria**:
  - [ ] Server accessible over SSH
  - [ ] Docker and Compose installed and working
  - [ ] Stack starts with `docker compose up -d`
  - [ ] SSL certificate valid and auto-renews
  - [ ] Public URL resolves and shows the game
- **Validation**: Visit public URL over HTTPS. Play a full game.

### Task 6.7: Add health check endpoint to backend

- **Description**: Production health check endpoint reporting status, version, DB connectivity.
- **Files to modify**:
  - `backend/src/index.ts` — update `/api/health`
- **Response**:
  ```json
  { "status": "ok", "version": "1.0.0", "timestamp": "2026-07-21T12:00:00Z", "database": "connected" }
  ```
- **Acceptance criteria**:
  - [ ] Returns status, version, timestamp
  - [ ] Database connectivity checked (query `SELECT 1`)
  - [ ] CI/CD pings this endpoint after deployment
- **Validation**: `curl https://footplay.example.com/api/health` returns valid JSON.

---

## Dependencies

- **Dev 1 (Repo Scaffold & Prisma Schema)** — directory structure, package.json, Prisma setup
- **(Implicit) Dev 5 (Wordle Algorithm & Game Loop)** — full app must be working for deployment
- Docker can be developed incrementally alongside Dev 2-5; final hardening is "Done" checklist

---

## Effort Estimate

**M (3-5 days)**

| Task | Estimate |
|------|----------|
| Task 6.1 (Frontend Dockerfile) | 0.5 day |
| Task 6.2 (Backend Dockerfile) | 0.5 day |
| Task 6.3 (Nginx config) | 0.5 day |
| Task 6.4 (Production docker-compose) | 0.5 day |
| Task 6.5 (GitHub Actions) | 0.5 day |
| Task 6.6 (Oracle provisioning + SSL) | 1 day |
| Task 6.7 (Health check) | 0.25 day |
| Buffer | 0.5 day (ARM64 issues, DNS, SSL) |

---

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ARM64 Docker build failures in CI | Medium | High | Test locally with emulation first. Pin to arm64-compatible tags. |
| SSL certificate setup complexity | Medium | Medium | Use certbot with webroot. Document steps. Test on staging domain. |
| Oracle Cloud Free Tier resource limits (4 GB RAM) | Low | Medium | Monitor usage. Split PostgreSQL if needed. |
| DNS propagation delay | Low | Low | Use Cloudflare for fast propagation. Test with IP directly first. |
| CI/CD secrets management | Low | Low | Use GitHub Actions secrets. Never commit secrets. |

---

## "Done" Checklist

- [ ] Frontend Dockerfile builds ARM64 image < 200 MB
- [ ] Backend Dockerfile builds ARM64 image < 300 MB
- [ ] Nginx config correctly proxies frontend and API
- [ ] docker-compose.yml starts all services (frontend, backend, postgres, nginx, certbot)
- [ ] `docker compose up` on a fresh machine starts the full stack
- [ ] GitHub Actions workflow builds, lints, and deploys on push to main
- [ ] Oracle Cloud instance provisioned with Docker + Compose
- [ ] SSL certificate valid and auto-renewal configured
- [ ] Public URL accessible over HTTPS
- [ ] `GET /api/health` returns status, version, database connectivity
- [ ] Full game loop works on deployed instance
- [ ] README updated with deployment instructions
- [ ] Repo tagged `v1.0.0`
- [ ] All changes committed to `dev-6/*` branch
