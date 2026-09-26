# 02 · Architecture

Deliverables: **#3 Stack · #5 Architecture Diagram · #11 Docker · #12 Object Storage · #14 AR · #15 Multi-Tenant · #16 Security · #17 Scaling · #18 Infra · #19 Costs**

---

## 3. Recommended technology stack

| Layer | Choice | Why (one line) |
|---|---|---|
| Language | TypeScript everywhere; Python only inside the Blender/TRELLIS containers | One skill set |
| Web app | **Next.js (App Router, `output: 'standalone'`)** | SSR/ISR, middleware tenant routing |
| Admin + API + Auth | **Payload CMS 3** mounted at `/admin` and `/api` in the same app | ~70% of the MVP for free |
| UI | **shadcn/ui + Radix + Tailwind v4**, lucide icons | Owned code, per-tenant theming |
| 3D / AR | **`<model-viewer>`** (public + admin preview) | Viewer, AR, iOS USDZ in one tag |
| DB | **PostgreSQL 17** (+ `pg_trgm`, `unaccent`, `citext`) | RLS, FTS, queue |
| ORM | Drizzle (inside Payload). Prisma optional for the read-only analytics service | See `03-data-model.md` |
| Queue | **pg-boss** | No Redis in the MVP |
| 3D worker | Docker image: COLMAP + OpenMVS + Blender 4.x + Node 22 (`gltf-transform`, `toktx`) on a **CUDA GPU** node | Photos → GLB |
| AI fallback worker | TRELLIS.2 container (GPU, ≥16 GB VRAM, 24 GB recommended) | Hard dishes |
| Storage | **SeaweedFS** (S3 API). Any S3 in prod | No lock-in |
| Images | Payload/sharp sizes at upload + optional **imgproxy** | AVIF/WebP |
| Edge | **Caddy 2** (auto-HTTPS, on-demand TLS for custom domains, HTTP/3) | Zero-touch certs |
| QR | node-qrcode (SVG/PNG) + react-pdf print sheets | n/a |
| Analytics | `menu_events` table + **Umami** | Privacy-friendly |
| Deploy | Docker Compose → **Coolify** on Hetzner/any VPS | Self-hosted PaaS |
| Observability | Pino logs → Loki, Prometheus + Grafana, Uptime Kuma (all OSS) | Optional in MVP |
| CI/CD | GitHub Actions (or Forgejo/Woodpecker for 100% self-host) → GHCR → Coolify webhook | n/a |

---

## 5. Architecture diagram

```
                                   ┌──────────────────────────────────────────┐
  Diner phone (Safari/Chrome)      │  DNS: *.menu.domain.com  +  custom domains│
  scans QR ──► menu.domain.com/    └───────────────────┬──────────────────────┘
               sushi-house?table=8                     │ HTTPS/HTTP3
                                                       ▼
                                  ┌──────────────────────────────────────────┐
                                  │  CADDY (edge)                            │
                                  │  • auto TLS, on-demand TLS ──ask──┐      │
                                  │  • gzip/zstd, cache static        │      │
                                  │  • /media/* → S3 (SeaweedFS)      │      │
                                  └───────┬───────────────────┬───────┼──────┘
                                          │                   │       │
                          ┌───────────────▼─────────────┐     │       │
                          │  WEB  (Next.js + Payload)   │◄────┼───────┘ GET /api/domains/verify?d=
                          │  stateless, N replicas      │     │
                          │ ┌─────────────┐┌──────────┐ │     │
                          │ │ Public menu ││ /admin   │ │     │
                          │ │ RSC + ISR   ││ Payload  │ │     │
                          │ │ model-viewer││ UI       │ │     │
                          │ └─────────────┘└──────────┘ │     │
                          │ ┌──────────────────────────┐│     │
                          │ │ /api  REST+GraphQL+Local ││     │
                          │ │ access control (tenant)  ││     │
                          │ │ hooks → pg-boss enqueue  ││     │
                          │ │ hooks → revalidateTag()  ││     │
                          │ └──────────────────────────┘│     │
                          └──────┬──────────────┬───────┘     │
                     SQL (RLS)   │              │ S3 API      │
                    ┌────────────▼───┐   ┌──────▼─────────────▼─────┐
                    │ POSTGRES 17    │   │ SEAWEEDFS  (S3 gateway)  │
                    │ • app tables   │   │ buckets:                 │
                    │ • pgboss.*     │   │  media-public  (CDN)     │
                    │ • RLS policies │   │  capture-private         │
                    │ • FTS indexes  │   │  models-public           │
                    └───────▲────────┘   └──────▲───────────────────┘
                            │ pg-boss poll       │ presigned GET/PUT
            ┌───────────────┴────────────────────┴─────────────────┐
            │  3D WORKER  (GPU node, 0..N, scale-to-zero possible) │
            │  job "reconstruct":                                  │
            │   1 download photos   2 COLMAP SfM                   │
            │   3 OpenMVS densify→mesh→refine→texture              │
            │   4 Blender: crop plate, clean, decimate, scale, bake│
            │   5 gltf-transform: meshopt + KTX2/WebP + resize     │
            │   6 glTF-Validator  7 poster.webp + USDZ             │
            │   8 upload → models-public   9 callback/update DB    │
            │  job "ai-generate": TRELLIS.2 → same steps 4–9       │
            └──────────────────────────────────────────────────────┘

  Optional side services: Umami (analytics) · imgproxy · Grafana/Loki · Uptime Kuma
  Phase 2 plug-ins (same web app, new Payload collections + services):
    Orders · Payments(adapter) · WhatsApp(Cloud API webhook) · Reservations(Cal)
    Loyalty · Customers(Better Auth) · Valkey+BullMQ (realtime/rate limit) · Meilisearch
```

**Request path for a public menu (hot path):** Caddy → Next.js route `/[restaurant]` → cached ISR HTML (tag `tenant:{id}`) → images/GLB served by Caddy straight from the S3 bucket with `Cache-Control: public, max-age=31536000, immutable`. Postgres is touched only on revalidation.

---

## 11. Docker architecture

| Container | Image | Replicas | Notes |
|---|---|---|---|
| `caddy` | `caddy:2` (with `caddy-dns` module if wildcard DNS-01) | 1 (2 with keepalived) | ports 80/443/443udp |
| `web` | `ghcr.io/you/menu3d-web` (Next standalone, Node 22 alpine) | 1→N | stateless. `PAYLOAD_SECRET`, `DATABASE_URI`, `S3_*` |
| `postgres` | `postgres:17` | 1 (+ replica later) | volume `pgdata`, nightly `pg_dump` + WAL-G to S3 |
| `seaweedfs` | `chrislusf/seaweedfs` (`server -s3`) | 1 → master/volume/filer split | volume `swdata` |
| `worker-3d` | `ghcr.io/you/menu3d-worker` (CUDA base + COLMAP + OpenMVS + Blender + Node) | 0→N on GPU hosts | `--gpus all` |
| `worker-ai` | `ghcr.io/you/menu3d-trellis` | 0→1 | optional profile |
| `umami` | `ghcr.io/umami-software/umami:postgresql-latest` | 1 | shares Postgres (separate DB) |
| `backup` | `prodrigestivill/postgres-backup-local` or WAL-G | 1 | n/a |

See `infra/docker-compose.yml` and `infra/Caddyfile`. Compose profiles are `core` (caddy, web, postgres, seaweedfs), `gpu` (worker-3d, worker-ai) and `ops` (umami, backup). The GPU worker usually runs on a **different host** and connects to Postgres and S3 over WireGuard/Tailscale (Headscale for 100% OSS).

---

## 12. Object storage design

```
media-public/                      (public-read via Caddy, immutable URLs)
  t/{tenantId}/restaurants/{restaurantId}/logo/{mediaId}-{w}.{avif|webp}
  t/{tenantId}/restaurants/{restaurantId}/cover/{mediaId}-{w}.{avif|webp}
  t/{tenantId}/dishes/{dishId}/photos/{mediaId}-{w}.{avif|webp}
models-public/
  t/{tenantId}/dishes/{dishId}/models/{modelId}/v{n}/model.glb        (≤ 3 MB target)
                                                  /model.usdz        (iOS Quick Look, optional)
                                                  /poster.webp       (first paint)
                                                  /model-lod1.glb    (optional low LOD)
capture-private/                   (never public; presigned only; lifecycle 30–90 days)
  t/{tenantId}/captures/{captureId}/raw/{0001..0150}.jpg
  t/{tenantId}/captures/{captureId}/work/…  (intermediate: sparse, dense, mesh.ply)
  t/{tenantId}/captures/{captureId}/logs/pipeline.log
```

Rules:
- **Content-addressed or versioned paths** (`v{n}` / `mediaId`). Never overwrite, so everything can be cached for a year as `immutable`.
- Uploads from the browser use **presigned PUT/multipart** (Uppy AwsS3 plugin), so raw photos never pass through Node.
- The DB stores `storage_key`, `bytes`, `sha256`, `mime` and `width/height`. URLs are derived, which lets you swap the CDN hostname freely.
- Lifecycle: delete `capture-private/*/work` after 7 days and raw photos after 90 days (configurable per plan).
- Quotas per tenant are enforced in Payload `beforeChange` hooks using `SUM(bytes)`.
- CORS on `models-public`: `GET` from `*` (model-viewer fetches cross-origin). Serve `.glb` as `model/gltf-binary` and `.usdz` as `model/vnd.usdz+zip` (Quick Look requires the exact MIME type).

---

## 14. AR architecture: "View On My Table"

```
 Dish sheet (bottom drawer)
 ┌─────────────────────────────┐
 │ <model-viewer               │   poster.webp paints instantly (LCP-safe)
 │   src=model.glb             │   GLB streams only on tap ("reveal=interaction")
 │   ios-src=model.usdz        │
 │   poster=poster.webp        │
 │   camera-controls touch-action="pan-y"
 │   ar ar-modes="webxr scene-viewer quick-look"
 │   ar-placement="floor"      │   (a table is a horizontal plane = "floor")
 │   ar-scale="auto"           │   pinch-to-scale allowed. Set "fixed" to lock real size
 │   shadow-intensity="1" environment-image="neutral"
 │   loading="lazy">           │
 │   <button slot="ar-button">🍽 View On My Table</button>
 │ </model-viewer>             │
 └─────────────────────────────┘
```

| Device | Path chosen by model-viewer | Experience |
|---|---|---|
| Android Chrome (ARCore) | **WebXR** `immersive-ar` + hit-test | In-page AR: place, drag, rotate (two-finger), pinch-scale |
| Android, no WebXR | **Scene Viewer** intent | Google's native AR viewer, back button returns to menu |
| iPhone/iPad (Safari, Chrome iOS) | **AR Quick Look** (USDZ) | Native AR: surface placement, rotate, scale, share |
| Desktop / no AR | Button hidden (`ar-status` / `canActivateAR`) | Show 3D orbit viewer + "Scan to view in AR" QR of the same URL |
| No WebGL / very old | `<img poster>` fallback | Photo gallery |

**Real-world scale:** Quick Look and Scene Viewer place models in **metres**. The pipeline therefore scales every model to the dish's real size (`dish.plate_diameter_cm`, default 27 cm). This is the single most important step for the dish to look "real on my table".

**Analytics:** listen to `ar-status` (`session-started`, `object-placed`, `failed`) → `POST /api/events` (anonymous, tenant-scoped).

**Performance budget:** GLB ≤ 3 MB (target 1–2 MB), ≤ 50k triangles, one 2048² KTX2/WebP base-colour texture (plus optional normal map), USDZ ≤ 8 MB.
*As built (2026-09-26):* ~1.4 MB, 40k triangles, one 2048² **JPEG** texture and no mesh compression, so the GLB needs no extensions (Scene Viewer). See [docs/04 §13.2.1](04-photogrammetry-pipeline.md#1321-as-built-2026-09-26-what-the-code-actually-does).

---

## 15. Multi-tenant strategy

**Model: pooled (shared DB, shared schema, `tenant_id` on every row) with defence in depth.** That's the right trade-off until you reach thousands of tenants or someone requires a dedicated DB.

```
 Tenant (billing/organisation)  1───*  Restaurant (brand/location, has slug + domains)
      │                                   │
      *── Membership(user, role)          *── Category ──* Dish ──* Model3D / Media
```

Separating **Tenant** (the paying account, franchise HQ) from **Restaurant** (a public menu) gives you franchises and multi-location in Phase 2 for free.

**Isolation layers:**
1. **App layer:** Payload `plugin-multi-tenant` adds `tenant` to collections, filters every query by the user's tenants and gives the admin a tenant switcher. Custom `access` functions on every collection check `req.user.memberships`.
2. **DB layer:** Postgres **RLS** on all tenant tables using `current_setting('app.tenant_id')`. Payload's DB connection sets it per transaction through a `beforeOperation` hook. The public menu reads through a restricted `menu_reader` role that only sees `published` rows. Platform admins use a `BYPASSRLS` role, used only by migrations and ops.
3. **Storage layer:** tenant-prefixed keys. Private buckets are only reachable through presigned URLs minted after an access check.
4. **Cache layer:** ISR tags `tenant:{id}` and `restaurant:{id}`, so one tenant's publish never busts another's cache.

**Tenant resolution (Next.js middleware):**
```
host == menu.domain.com         → path /{restaurantSlug}         (MVP)
host == {slug}.menu.domain.com  → rewrite to /{slug}              (Phase 2 subdomains)
host ∈ custom_domains(verified) → rewrite to /{restaurantSlug}    (white label)
```

**Onboarding flow:** sign up → create Tenant + owner Membership → wizard (restaurant name → slug check → logo/colours → first category → first dish) → `status=draft` → "Publish" → QR PDF download. Seed optional demo content via Payload Local API.

**Custom domains:**
1. The owner adds `menu.sushihouse.com.py` → a row in `custom_domains` with a random `verification_token`.
2. The owner creates a CNAME → `edge.menu.domain.com` (and a TXT `_menu3d.<domain>=token`).
3. A cron job verifies DNS → `verified_at`.
4. Caddy `on_demand_tls { ask https://web/api/domains/verify }` issues a cert only for verified domains, which stops certificate abuse.

**Billing-ready:**
- `plans` holds limits as JSONB (restaurants, dishes, 3D generations per month, storage GB, custom domain allowed).
- `subscriptions` tracks tenant, plan, status, provider and provider id.
- `usage_counters` is incremented by hooks (e.g. per reconstruction job).
- Enforcement lives in one `can(tenant, 'feature')` helper.
- Providers sit behind a `BillingProvider` interface: Stripe, Mercado Pago, regional gateways, or Kill Bill as the OSS billing engine. The MVP can run "manual invoice" plans.

**Escape hatch:** because every table carries `tenant_id`, moving a big tenant to its own database (silo) is a filtered `pg_dump` plus a routing entry. There's no redesign.

---

## 16. Security model

| Area | Control |
|---|---|
| AuthN (staff) | Payload auth: bcrypt/argon hashing, HTTP-only secure cookies, CSRF protection, lockout after N failed logins, optional TOTP (community plugin) or OIDC → Keycloak for franchises |
| AuthZ | Roles: `platform_admin`, `tenant_owner`, `tenant_admin`, `editor`, `viewer`. Checked in Payload `access` plus RLS |
| Tenant isolation | App filters + **RLS** + automated cross-tenant tests in CI (user A must never read B) |
| Public surface | Only `published` data. Rate limiting at Caddy (`caddy-ratelimit`) on `/api/*` and `/api/events` |
| Uploads | Presigned URLs (5 min expiry), MIME sniffing + extension allowlist (jpg/png/heic/webp/glb/usdz), size caps, EXIF/GPS stripped by sharp, **glTF-Validator** before a GLB is published, SVG uploads disabled (XSS) |
| Worker | No inbound ports. Pulls jobs only. Scoped S3 credentials (read `capture-private/`, write `models-public/`). Runs as non-root with seccomp. Tools run under per-job timeouts |
| Secrets | `.env` via Coolify secrets / Docker secrets. Nothing in the image. Rotate `PAYLOAD_SECRET` and S3 keys yearly |
| Transport | TLS 1.2+ everywhere (Caddy), HSTS, internal traffic on a private Docker network or WireGuard |
| Headers | CSP (allow `blob:` + model-viewer worker, the S3 host), `Permissions-Policy: camera=(self), xr-spatial-tracking=(self)`, `X-Frame-Options: SAMEORIGIN` |
| Table QR spoofing (Phase 2 orders) | `?table=8&sig=HMAC(restaurant, table)`. Unsigned table params are display-only |
| Privacy | No diner PII in the MVP. Analytics cookieless (Umami). GDPR / LatAm data-protection-ready: export/delete tenant data |
| Backups | Nightly logical dump + continuous WAL to off-site S3, restore tested monthly. S3 bucket versioning on `models-public` |
| Supply chain | Renovate, `npm audit`/OSV-Scanner, Trivy image scan, pinned image digests, SBOM (Syft) in CI |

---

## 17. Scaling strategy

| Stage | Tenants | Setup |
|---|---|---|
| **S0: MVP** | 1–50 | 1 VPS (4 vCPU/8 GB): caddy, web, postgres, seaweedfs. GPU on demand (rented by the hour) or a spare local RTX machine |
| **S1** | 50–500 | Web ×2 behind Caddy. Postgres on its own VM with a streaming replica. SeaweedFS 3 nodes. 1 dedicated GPU worker. Optional CDN (Bunny/Cloudflare) in front of `media-public`/`models-public` only (no lock-in: a plain cache) |
| **S2** | 500–5k | K3s or Nomad. Web autoscale. PgBouncer, read replica for public menu reads. Valkey + BullMQ for realtime/orders. Meilisearch. Multiple GPU workers (queue depth drives scale) |
| **S3** | 5k+ | Silo big tenants onto dedicated DBs. Region shards (LatAm/EU). Object storage multi-site (SeaweedFS replication or managed S3) |

Why it scales cheaply: public menus are **static ISR HTML plus immutable assets**. 95% of traffic never touches Node or Postgres. The expensive part is GPU minutes, and those are queued, metered per tenant and billable.

---

## 18. Infrastructure requirements

| Role | MVP minimum | Recommended | Notes |
|---|---|---|---|
| App host (caddy+web+pg+s3) | 2 vCPU / 4 GB / 80 GB SSD | 4 vCPU / 8–16 GB / 160 GB NVMe | Ubuntu 24.04 / Debian 12, Docker 27+ |
| GPU worker (photogrammetry) | NVIDIA 8 GB VRAM (RTX 3060/4060), 32 GB RAM, 200 GB NVMe | RTX 4000 Ada / 4090 24 GB, 64 GB RAM | CUDA 12.x, nvidia-container-toolkit. COLMAP/OpenMVS can run CPU-only but take 5–10× longer |
| GPU worker (TRELLIS.2) | 16 GB VRAM | 24 GB VRAM | Optional |
| Backups | 100 GB off-site S3 | n/a | Backblaze/Hetzner/Wasabi or 2nd SeaweedFS |
| DNS | Wildcard `*.menu.domain.com`, `edge.` A/AAAA | n/a | Cloudflare DNS-only or deSEC (OSS-friendly) |

**Typical job time** (60 photos at 12 MP, RTX 4000-class): SfM 2–4 min, dense+mesh+texture 6–12 min, Blender+optimise 1–2 min. **About 10–20 min per dish.** TRELLIS.2 takes about 30–90 s.

---

## 19. Cost estimates (USD/month, Sept 2026 street prices. Verify before buying)

| Scenario | Items | ≈ Cost |
|---|---|---|
| **Dev / pilot** | 1× Hetzner CX32/CPX31-class VPS (~$8–15) + object storage 100 GB (~$5) + rented GPU on demand (RunPod/Vast ~$0.30–0.70/h × ~10 h) | **$20–30** |
| **Launch (≤ 100 restaurants)** | App VPS 8 vCPU/16 GB (~$30) + DB VPS (~$15) + backups (~$5) + GPU on demand ~40 h (~$25) + domain/email (~$5) | **$80–100** |
| **Growth (≤ 1,000 restaurants)** | 3 app nodes (~$90) + managed-style Postgres VM pair (~$60) + SeaweedFS 3 nodes 1 TB (~$60) + dedicated GPU server (Hetzner GEX44-class ~$200) + CDN egress (~$20–50) | **$450–550** |
| **Own GPU instead** | One-off RTX 4090 workstation ≈ $2.5–3k, amortised over 24 months | ≈ $110 + power |

**Unit economics:** a 3D generation costs about $0.05–0.25 in GPU time. Public menu serving is effectively free (static). Licensing cost is **$0**.
