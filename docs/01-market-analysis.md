# 01 · Open Source Market Analysis, Build-vs-Buy, License Review

> Data pulled live from the GitHub API on **2026-09-25**. Stars rounded to nearest 0.1k.
> "Last push" = most recent commit on any branch. ★ = pick.

Deliverables covered here: **#1 Market Analysis · #2 Build vs Buy · #4 License Risk Review · #23 OSS To Reuse · #24 Top 20 Repos · Claude Code ecosystem**

---

## 1. Open Source Market Analysis

### 1.1 Admin platforms / CMS (also the "CMS Alternatives" section)

| Rank | Name | GitHub | License | Stars | Last push | Verdict |
|---|---|---|---|---|---|---|
| ★1 | **Payload CMS 3** | github.com/payloadcms/payload | **MIT** | 45.0k | 2026-09-25 | **Pick.** Runs *inside* Next.js |
| 2 | Strapi 5 | github.com/strapi/strapi | MIT core + `ee/` commercial | 73.2k | 2026-09-25 | Strong fallback |
| 3 | Refine | github.com/refinedev/refine | MIT | 35.7k | 2026-09-10 | Fine if you already have an API |
| 4 | React Admin | github.com/marmelab/react-admin | MIT | 26.9k | 2026-09-25 | Mature. Same shape as Refine |
| 5 | Appsmith | github.com/appsmithorg/appsmith | Apache-2.0 | 40.9k | 2026-09-25 | Internal tools only |
| ✗ | ToolJet | github.com/ToolJet/ToolJet | **AGPL-3.0** | 41.0k | 2026-09-25 | Internal tools only. AGPL |
| ✗ | Directus | github.com/directus/directus | **MSCL-1.0 (source-available, NOT OSI)** | 38.0k | 2026-09-25 | **Disqualified.** License fails "100% OSS" |

**Payload CMS: advantages**
- Installs into the same Next.js app (`/admin` route). That gives one codebase, one deploy, one container.
- First-party packages cover roughly 70% of the MVP out of the box:
  - `plugin-multi-tenant`: tenant field, tenant switcher, and scoped access control
  - `storage-s3`: any S3-compatible bucket
  - `plugin-seo`
  - `plugin-mcp`: Claude can read and write content
  - `plugin-import-export`
  - `plugin-ecommerce` and `plugin-stripe` for Phase 2
- Includes auth for staff users, RBAC, uploads with `sharp` resizing, drafts/versions, localization (ES/EN/PT/GN), a jobs queue, and REST, GraphQL and a typed Local API.
- Uses Postgres through Drizzle, with generated migrations.
- It was acquired by Figma in 2025 and is still MIT. Commit velocity is still very high.

**Payload CMS: disadvantages**
- Payload owns the schema through its collections, so you don't hand-write Prisma models for admin data. See the ORM note in `03-data-model.md`.
- Admin customisation is React components (fine) rather than drag-and-drop.
- The multi-tenant plugin uses a shared schema, so tenant isolation is only as good as your access functions. We add Postgres RLS on top.

**Why the others lose**
- **Strapi:** a separate Node service with its own admin build. SSO/RBAC audit logs and review workflows are in `ee/`, so you run two apps instead of one.
- **Directus:** the best DX of the group, but the MSCL license limits commercial use by revenue and is not OSI-approved.
- **Refine / React Admin:** a UI kit with no backend. You'd write the API, auth, uploads and access control yourself, which is exactly the custom code we want to avoid.
- **Appsmith / ToolJet:** low-code internal-tool builders. Not white-label-able as a tenant-facing SaaS admin, and ToolJet is AGPL.

**Is a custom admin panel necessary?** **No.** Payload's generated admin covers restaurant, category and dish CRUD, media, and drag-to-order (with `orderable: true` collections). Custom code is limited to three React components inside Payload admin:
1. The 3D upload/generation widget with live status
2. The model preview and orientation/scale calibration (model-viewer)
3. The QR sheet generator

---

### 1.2 Frontend framework

| Rank | Name | GitHub | License | Stars | Last push | Notes |
|---|---|---|---|---|---|---|
| ★1 | **Next.js 15/16** | github.com/vercel/next.js | MIT | 142.4k | 2026-09-25 | Payload is Next-native. ISR, RSC, middleware for tenant routing |
| 2 | Astro | github.com/withastro/astro | MIT | 62.8k | 2026-09-25 | Best raw performance for static menus. No admin story |
| 3 | Nuxt | github.com/nuxt/nuxt | MIT | 60.9k | 2026-09-25 | Excellent, but the Vue ecosystem has fewer 3D/admin options |

**Why Next.js:** Payload, shadcn/ui, R3F and Better Auth are all React/Next-first. It self-hosts fine with `output: 'standalone'` in Docker, so there's no Vercel lock-in. ISR plus on-demand `revalidateTag()` from Payload hooks makes public menus effectively static HTML.
**Downside:** heavier than Astro. We mitigate by rendering the public menu as RSC with near-zero client JS, and model-viewer lazy-loads only when a dish opens.

---

### 1.3 UI libraries

| Rank | Name | GitHub | License | Stars | Last push | Role |
|---|---|---|---|---|---|---|
| ★1 | **shadcn/ui** | github.com/shadcn-ui/ui | MIT | 124.6k | 2026-09-24 | Base component system (copy-in code, you own it) |
| ★2 | **Radix UI Primitives** | github.com/radix-ui/primitives | MIT | 19.3k | 2026-08-08 | Comes with shadcn. Accessible primitives |
| ★3 | **Tailwind CSS v4** | github.com/tailwindlabs/tailwindcss | MIT | 97.7k | 2026-09-25 | Styling and per-tenant theming via CSS vars |
| 4 | Magic UI | github.com/magicuidesign/magicui | MIT | 22.4k | 2026-09-20 | Marketing/landing flourishes only |
| 5 | Mantine | github.com/mantinedev/mantine | MIT | 31.8k | 2026-09-23 | Great batteries-included kit, but a second design system would clash with shadcn/Tailwind |
| ✗ | Aceternity UI | (no OSS repo; copy-paste site) | Custom terms, not OSI | n/a | n/a | Avoid in product. Marketing site at most |

**Why shadcn:** you own the code, it themes per tenant through CSS variables (`--primary` from the restaurant's brand colour), and it has an **official MCP server** and registry, so Claude Code can add components deterministically.

---

### 1.4 3D rendering

| Rank | Name | GitHub | License | Stars | Last push | Role |
|---|---|---|---|---|---|---|
| ★1 | **`<model-viewer>`** | github.com/google/model-viewer | Apache-2.0 | 8.3k | 2026-07-07 | **Public viewer and AR.** One web component |
| ★2 | Three.js | github.com/mrdoob/three.js | MIT | 115.9k | 2026-09-25 | Engine under model-viewer and R3F |
| 3 | React Three Fiber (+ drei) | github.com/pmndrs/react-three-fiber | MIT | 32.5k | 2026-09-25 | Phase 2 only: rich "3D menu scenes" or a custom editor |
| 4 | Babylon.js | github.com/BabylonJS/Babylon.js | Apache-2.0 | 26.1k | 2026-09-25 | Excellent full engine, overkill here |

**Why model-viewer wins outright:**
- Rotate, zoom, fullscreen, poster images, lazy loading, progress bar, `loading="lazy"`, `reveal="interaction"`, Draco/Meshopt/KTX2 decoding and hotspots are all built in, in about 1 line of HTML.
- **AR in one attribute:** `ar ar-modes="webxr scene-viewer quick-look"`.
  - It picks **WebXR** on Android Chrome, falls back to **Scene Viewer** on other Android, and uses **AR Quick Look** on iOS.
  - On iOS it generates **USDZ on the fly** from the GLB if you don't provide `ios-src`.
- The last push was July 2026 and the project is in slow maintenance mode. That's acceptable because the API has been stable for years and the heavy lifting is Three.js, which is very active.

---

### 1.5 Photogrammetry and 3D generation

| Rank | Name | GitHub | License | Stars | Last push | Role |
|---|---|---|---|---|---|---|
| ★1 | **COLMAP** | github.com/colmap/colmap | BSD-3 | 12.8k | 2026-09-25 | Structure-from-Motion (camera poses) and optional dense MVS. GLOMAP (global SfM) is now merged in, and the standalone repo is archived |
| ★2 | **OpenMVS** | github.com/cdcseacave/openMVS | **AGPL-3.0** | 4.1k | 2026-09-16 | Densify → mesh → refine → **texture**. Best OSS textured-mesh quality. Run as an unmodified CLI in its own container |
| 3 | Meshroom / AliceVision | github.com/alicevision/Meshroom | MPL-2.0 | 13.0k | 2026-09-25 | All-in-one node graph with a CLI (`meshroom_batch`). Needs CUDA. Good plan B for a single tool |
| 4 | OpenMVG | github.com/openMVG/openMVG | MPL-2.0 | 6.6k | 2026-08-30 | SfM only. COLMAP is more robust today |
| ★ | **Blender (headless)** | github.com/blender/blender | GPL-3.0+ | 20.5k | 2026-09-25 | Scripted cleanup: plate/background removal, decimate, re-bake textures, orient, scale, USDZ export |
| ★ | **glTF-Transform** | github.com/donmccurdy/glTF-Transform | MIT | 2.0k | 2026-09-25 | Final optimisation: weld, simplify, meshopt/Draco, KTX2/WebP textures, resize |
| ★ | meshoptimizer | github.com/zeux/meshoptimizer | MIT | 8.4k | 2026-09-25 | Used by glTF-Transform (`gltfpack` too) |
| ★ | KTX-Software | github.com/KhronosGroup/KTX-Software | Apache-2.0 | 1.4k | 2026-09-24 | `toktx` Basis/UASTC GPU texture compression |
| ★ | glTF-Validator | github.com/KhronosGroup/glTF-Validator | Apache-2.0 | 0.5k | 2026-09-18 | QA gate before publish |
| alt | **Microsoft TRELLIS.2** | github.com/microsoft/TRELLIS.2 | MIT | 11.4k | 2026-07-10 | **AI image-to-3D fallback** (1–4 photos). Great for dishes where photogrammetry fails (soups, glossy sauces) |
| alt | TripoSR | github.com/VAST-AI-Research/TripoSR | MIT | 7.0k | 2026-06-04 | Faster, lower-quality single-image-to-3D |
| ✗ | Hunyuan3D-2 | github.com/Tencent-Hunyuan/Hunyuan3D-2 | Tencent community license (territory limits) | 15.0k | 2025-10 | Not OSI. Avoid |
| ✗ | 3D Gaussian Splatting (Inria) | github.com/graphdeco-inria/gaussian-splatting | Non-commercial | 24.0k | 2025-10 | License blocks SaaS use. Splats also don't work in Quick Look or Scene Viewer AR |
| ✗ | OpenDroneMap | github.com/OpenDroneMap/ODM | AGPL-3.0 | 6.5k | 2026-09-16 | Aerial/terrain focus |

**Opinion:** photos → **COLMAP** (SfM) → **OpenMVS** (dense, mesh, texture) → **Blender script** (clean, scale, orient) → **glTF-Transform** (compress) → GLB (+ USDZ). Offer **TRELLIS.2** as a one-click fallback, and always allow **manual GLB upload** (from Polycam/Luma/RealityScan exports or a 3D artist).
Honest caveat: food is a hard photogrammetry subject (specular sauces, translucent drinks, steam). Plan for 60–70% "good enough" automatic success on plated solids, and use manual/AI for the rest. See `04-photogrammetry-pipeline.md`.

---

### 1.6 AR

| Rank | Option | License | Surface placement? | iOS? | Verdict |
|---|---|---|---|---|---|
| ★1 | **model-viewer AR** (WebXR + Scene Viewer + Quick Look) | Apache-2.0 | Yes | **Yes** (Quick Look) | **Pick.** Zero custom AR code |
| 2 | Raw WebXR (`immersive-ar` + hit-test) via Three.js | W3C / MIT | Yes | **No.** iOS Safari still has no `immersive-ar` | Only as part of model-viewer |
| ✗ | AR.js (github.com/AR-js-org/AR.js, MIT, 6.0k, 2026-06) | MIT | No, marker or location based | Partial | Wrong tool: needs printed markers |
| ✗ | Needle Engine (github.com/needle-tools, support repo only) | Proprietary engine with a free tier | Yes | Yes (via its own App Clip route) | Not OSS. Vendor lock-in |

"View On My Table" = model-viewer's AR button, restyled. See `02-architecture.md §14`.

---

### 1.7 Authentication

| Rank | Name | GitHub | License | Stars | Last push | Verdict |
|---|---|---|---|---|---|---|
| ★1 | **Payload built-in auth** | (payload) | MIT | n/a | n/a | **MVP:** staff logins, API keys, RBAC. Nothing to deploy |
| ★2 | **Better Auth** | github.com/better-auth/better-auth | MIT | 30.1k | 2026-09-25 | **Phase 2:** diner accounts (loyalty/orders): OTP/WhatsApp, passkeys, organisations. Auth.js is now maintained by the Better Auth team |
| 3 | Keycloak | github.com/keycloak/keycloak | Apache-2.0 | 37.0k | 2026-09-25 | Enterprise/franchise SSO (SAML/OIDC broker). Heavy JVM, add only when a franchise demands SSO. Payload supports OIDC through community plugins |
| 4 | Auth.js (next-auth) | github.com/nextauthjs/next-auth | ISC | 28.4k | 2026-07-22 | Maintenance-mode trajectory. Prefer Better Auth |
| ✗ | Zitadel | github.com/zitadel/zitadel | **AGPL-3.0** (since v3) | 15.1k | 2026-09-25 | Good product, but now AGPL |

---

### 1.8 Database

| Rank | Name | License | Stars | Verdict |
|---|---|---|---|---|
| ★1 | **PostgreSQL 17/18** (github.com/postgres/postgres) | PostgreSQL License (MIT-like) | 22.2k (mirror) | RLS for tenant isolation, JSONB, `pg_trgm`/FTS (no search server needed for MVP), a Postgres job queue (pg-boss), and Payload's first-class adapter |
| 2 | MariaDB (github.com/MariaDB/server) | GPL-2.0 | 8.3k | No RLS. Payload has no MariaDB adapter. Not considered further |

---

### 1.9 Object storage

| Rank | Name | GitHub | License | Stars | Last push | Verdict |
|---|---|---|---|---|---|---|
| ★1 | **SeaweedFS** | github.com/seaweedfs/seaweedfs | Apache-2.0 | 35.0k | 2026-09-25 | **Pick for self-hosting.** S3 gateway, small-file optimised, scales out, very active |
| 2 | Garage | git.deuxfleurs.fr / github mirror deuxfleurs-org/garage | AGPL-3.0 | 4.6k | 2026-09-25 | Tiny, geo-distributed, great for 3-node home-lab clusters. AGPL, but used unmodified as a service |
| 3 | RustFS | github.com/rustfs/rustfs | Apache-2.0 | 33.9k | 2026-09-25 | MinIO-compatible drop-in, but young. Watch for 2027 |
| ✗ | **MinIO** | github.com/minio/minio | AGPL-3.0 | 61.4k | **archived 2026-04** | **Do not adopt.** The community edition lost its console (2025), then binaries and images, and the repo is now archived |

**Rule:** code only against the **S3 API** (`@aws-sdk/client-s3` via Payload `storage-s3`). Then SeaweedFS ⇄ Garage ⇄ Hetzner/Backblaze/R2 is just an env-var change, so there's no lock-in.

---

### 1.10 Background jobs

| Rank | Name | GitHub | License | Stars | Last push | Verdict |
|---|---|---|---|---|---|---|
| ★1 | **pg-boss** | github.com/timgit/pg-boss | MIT | 4.0k | 2026-09-25 | **Pick.** Postgres-backed queue (retries, cron, singleton, throttling), so there's **no Redis** in the MVP. The GPU worker polls it |
| 2 | BullMQ | github.com/taskforcesh/bullmq | MIT | 9.4k | 2026-09-25 | Adopt when you add Redis anyway (Phase 2 orders/real-time, rate limiting) |
| 3 | Graphile Worker | github.com/graphile/worker | MIT | 2.4k | 2026-09-13 | Equivalent to pg-boss, fine choice |
| 4 | Payload Jobs Queue | (payload) | MIT | n/a | n/a | Good for light in-app tasks (webhooks, revalidation). Less suited to external GPU workers |
| 5 | Temporal | github.com/temporalio/temporal | MIT | 23.3k | 2026-09-25 | Durable workflows. Overkill until payments/orders sagas |
| 6 | Trigger.dev | github.com/triggerdotdev/trigger.dev | Apache-2.0 | 16.4k | 2026-09-24 | Self-host is heavy (many services). Its cloud is its sweet spot |

---

### 1.11 Search

| Rank | Name | GitHub | License | Stars | Verdict |
|---|---|---|---|---|---|
| ★1 | **Postgres FTS + `pg_trgm` + `unaccent`** | n/a | PostgreSQL | n/a | A menu has 20–300 dishes. It's instant, typo-tolerant enough, and needs zero infrastructure |
| 2 | Meilisearch | github.com/meilisearch/meilisearch | **MIT core + BUSL-1.1 "EE" parts** | 59.4k | Add in Phase 2 for cross-restaurant discovery ("sushi near me"). Stay on Community Edition features |
| 3 | Typesense | github.com/typesense/typesense | GPL-3.0 | 26.6k | Good, but GPL server |

---

### 1.12 Multi-tenant SaaS building blocks

| Need | Pick | License | Stars |
|---|---|---|---|
| Tenant data scoping | Payload `plugin-multi-tenant` + **Postgres RLS** | MIT / PostgreSQL | n/a |
| Custom domains + auto-TLS | **Caddy** on-demand TLS (github.com/caddyserver/caddy) | Apache-2.0 | 76.1k |
| Alt reverse proxy | Traefik (github.com/traefik/traefik) | MIT | 65.0k |
| Billing engine (Phase 2) | **Kill Bill** (github.com/killbill/killbill) | Apache-2.0 | 5.8k |
| Alt billing | Lago (github.com/getlago/lago) | AGPL-3.0 | 10.6k |
| PaaS to deploy it all | **Coolify** (github.com/coollabsio/coolify) | Apache-2.0 | 62.3k |
| Alt PaaS | Dokploy (github.com/Dokploy/dokploy) | Apache-2.0 + `/proprietary` dir | 37.5k |
| Product analytics | **Umami** (github.com/umami-software/umami) | MIT | 39.0k |
| Deep analytics (Phase 2) | PostHog (github.com/PostHog/posthog) | MIT core + `ee/` | 39.9k |
| Reservations (Phase 2) | Cal (github.com/calcom/cal.diy) | MIT | 48.6k |
| WhatsApp (Phase 2) | Official Meta Cloud API (recommended) · Evolution API (github.com/evolution-foundation/evolution-api) | Apache-2.0 **+ extra conditions** | 9.7k |

Payment processors (Stripe, Mercado Pago, regional gateways) are inherently external. The architecture hides them behind a `PaymentProvider` interface, so no single one is load-bearing.

---

### 1.13 Supporting libraries

| Purpose | Pick | GitHub | License | Stars |
|---|---|---|---|---|
| Image processing | sharp (used by Payload) | github.com/lovell/sharp | Apache-2.0 | 32.7k |
| On-the-fly image CDN | imgproxy | github.com/imgproxy/imgproxy | Apache-2.0 (OSS edition) | 11.1k |
| Resumable multi-photo upload | Uppy (+ tus) | github.com/transloadit/uppy | MIT | 31.0k |
| QR generation | node-qrcode | github.com/soldair/node-qrcode | MIT | 8.2k (stable; last push 2024) |
| Styled/branded QR | qr-code-styling | github.com/kozakdenys/qr-code-styling | MIT | 2.9k |
| Printable QR table tents | react-pdf | github.com/diegomura/react-pdf | MIT | 16.8k |
| Validation | Zod | github.com/colinhacks/zod | MIT | 44.0k |
| ORM (Payload uses) | Drizzle | github.com/drizzle-team/drizzle-orm | Apache-2.0 | 35.9k |
| ORM (worker/analytics option) | Prisma | github.com/prisma/orm | Apache-2.0 | 47.7k |
| Lightweight API (worker callbacks) | Hono | github.com/honojs/hono | MIT | 32.3k |
| E2E tests | Playwright | github.com/microsoft/playwright | Apache-2.0 | 96.7k |

---

### 1.14 Claude Code ecosystem (accelerators for *building* the product)

| Name | GitHub | License | Stars | Last push | How it speeds this project |
|---|---|---|---|---|---|
| **ui-ux-pro-max skill** (already installed) | github.com/nextlevelbuilder/ui-ux-pro-max-skill | MIT | 130.6k | 2026-09-21 | Design system, palettes and font pairings for the menu theme presets. Use `/ui-ux-pro-max:design-system` |
| **shadcn MCP / registry** | github.com/shadcn-ui/ui | MIT | 124.6k | 2026-09-24 | Claude adds exact components (`npx shadcn mcp`) |
| **Context7 MCP** | github.com/upstash/context7 | MIT | 62.4k | 2026-09-25 | Up-to-date Payload 3, Next and model-viewer docs in context, avoiding outdated-API hallucinations |
| **Payload `plugin-mcp`** | payloadcms/payload | MIT | n/a | n/a | Claude can seed demo restaurants and dishes straight into the CMS |
| **Playwright MCP** | github.com/microsoft/playwright-mcp | Apache-2.0 | 37.6k | 2026-09-25 | Claude drives the mobile menu, takes screenshots and writes E2E tests |
| **Chrome DevTools MCP** | github.com/ChromeDevTools/chrome-devtools-mcp | Apache-2.0 | 52.6k | 2026-09-25 | Lighthouse/perf traces of the menu page (LCP budget) |
| **Blender MCP** | github.com/ahujasid/mcp-for-blender | MIT | 29.3k | 2026-09-25 | Iterate on the Blender cleanup script interactively, and fix hard models by hand |
| **Postgres MCP Pro** | github.com/crystaldba/postgres-mcp | MIT | 3.3k | 2026-08-17 | Index tuning, RLS policy checks, query plans |
| GitHub MCP | github.com/github/github-mcp-server | MIT | 33.2k | 2026-09-25 | Issues/PR automation |
| Official MCP servers | github.com/modelcontextprotocol/servers | MIT/Apache mix | 90.6k | 2026-09-22 | Reference servers (filesystem, fetch, git) |
| **Superpowers** | github.com/obra/superpowers | MIT | 291.6k | 2026-09-25 | TDD/plan/brainstorm skills. Good discipline for a solo builder |
| Anthropic Skills | github.com/anthropics/skills | Mixed (per skill) | 178.3k | 2026-09-24 | Official skills (docx/pdf for QR print sheets, skill-creator) |
| wshobson/agents | github.com/wshobson/agents | MIT | 40.0k | 2026-09-25 | Pre-built subagents (DB architect, security auditor) |
| awesome-claude-code | github.com/hesreallyhim/awesome-claude-code | CC-style list | 54.6k | 2026-09-25 | Discovery list |
| awesome-mcp-servers | github.com/punkpeye/awesome-mcp-servers | MIT | 95.5k | 2026-09-23 | Discovery list |
| awesome-ai-agents | github.com/e2b-dev/awesome-ai-agents | list | 30.2k | 2026-08-21 | Discovery list |
| OSS coding agents | OpenCode (anomalyco/opencode, MIT, 210.1k) · OpenHands (MIT, 89.2k) · Cline (Apache, 69.3k) · Continue (Apache, 36.0k) · Aider (Apache, 49.2k, last push 2026-05) | n/a | n/a | n/a | Model-agnostic alternatives if you ever need a fully OSS toolchain |

**Recommended `.mcp.json` for this repo:** context7, shadcn, playwright, chrome-devtools, postgres-mcp, payload-mcp (see `05-delivery.md`).

---

## 2. Build vs Buy (reuse) Analysis

| Capability | Decision | Reuse | Custom code estimate |
|---|---|---|---|
| Admin CRUD (restaurants, categories, dishes, media) | **Reuse** | Payload collections + admin UI | ~400 LOC config |
| Multi-tenancy | **Reuse + harden** | `plugin-multi-tenant` + RLS policies | ~150 LOC + SQL |
| Staff auth / RBAC | **Reuse** | Payload auth | ~100 LOC access fns |
| Image upload/resize | **Reuse** | Payload upload + sharp + storage-s3 | config only |
| Multi-photo capture upload | **Reuse** | Uppy (tus/S3 multipart) in a custom admin field | ~200 LOC |
| 3D viewer + rotate/zoom/fullscreen | **Reuse** | model-viewer | ~80 LOC wrapper |
| AR "View On My Table" | **Reuse** | model-viewer AR modes | ~60 LOC |
| Photogrammetry | **Reuse + orchestrate** | COLMAP, OpenMVS, Blender, glTF-Transform | **~800 LOC** (worker + Blender py) ← main custom IP |
| AI 3D fallback | **Reuse** | TRELLIS.2 container | ~150 LOC adapter |
| QR codes + print sheets | **Reuse** | node-qrcode + react-pdf | ~250 LOC |
| Public menu UI | **Build** (it's the product) | shadcn/ui + Tailwind | ~1.5k LOC |
| Tenant theming | **Build (small)** | CSS vars + ui-ux-pro-max presets | ~150 LOC |
| Custom domains/TLS | **Reuse** | Caddy on-demand TLS + `ask` endpoint | ~40 LOC |
| Search | **Reuse** | Postgres FTS | ~40 LOC |
| Analytics | **Reuse** | Umami (self-host) + `menu_events` table | ~80 LOC |
| Deploy/PaaS | **Reuse** | Coolify or plain Docker Compose | config |
| Billing | **Defer** | Kill Bill / provider adapters | Phase 2 |

**Total custom code for the MVP: about 4–5k LOC**, most of it the public menu UI and the 3D worker.

---

## 4. License Risk Review

| Risk | Component | License | Exposure | Mitigation |
|---|---|---|---|---|
| 🟢 None | Next.js, Payload, shadcn, Radix, Tailwind, Three, model-viewer, glTF-Transform, meshoptimizer, pg-boss, BullMQ, Better Auth, Zod, Drizzle, Prisma, Uppy, sharp, Caddy, Traefik, Umami, TRELLIS.2 | MIT / Apache-2.0 / ISC / BSD | n/a | Keep NOTICE files (Apache) |
| 🟢 None | PostgreSQL | PostgreSQL License | n/a | n/a |
| 🟢 None | COLMAP | BSD-3 | Some optional deps (e.g. CUDA libs) have their own licenses | Use the official Docker image |
| 🟡 Low | Meshroom / AliceVision / OpenMVG | MPL-2.0 | File-level copyleft only if you *modify* their files | Use unmodified binaries |
| 🟡 Low | **OpenMVS** | **AGPL-3.0** | AGPL is triggered when you modify it *and* expose it over a network. We run it unmodified as a CLI in an internal worker; users never interact with it directly | Pin an upstream image, don't patch, keep a source link in NOTICE. If you ever patch it, publish the patch |
| 🟡 Low | Blender | GPL-3.0+ | Used as a separate tool. Output files (GLB) are **not** covered by GPL. Your `.py` scripts that `import bpy` are arguably GPL | Keep Blender scripts in a separate `/workers/blender` folder under GPL-3.0 (or publish them). Nothing is lost |
| 🟡 Low | SeaweedFS (Apache) / Garage (AGPL) | Mixed | Garage unmodified as a service = fine | Prefer SeaweedFS |
| 🟡 Low | Strapi / Medusa / PostHog / Meilisearch | MIT + `ee/` or BUSL parts | Accidentally importing EE code | Not in the MVP. If adopted, lint for `ee/` imports |
| 🔴 Avoid | Directus | MSCL-1.0 (source-available) | Revenue-based commercial restriction, not OSI | Rejected |
| 🔴 Avoid | MinIO | AGPL-3.0, repo **archived** | No security updates | Rejected, use SeaweedFS |
| 🔴 Avoid | Inria 3DGS, Hunyuan3D, Stability SF3D | Non-commercial / territorial | Can't be used in a SaaS | Rejected, use TRELLIS.2 (MIT) |
| 🔴 Avoid | Needle Engine, Aceternity UI | Proprietary / custom | Lock-in | Rejected |
| 🟠 Watch | Evolution API | Apache-2.0 **+ attribution/notification clauses** | Not pure Apache | Prefer the official WhatsApp Cloud API (external service, not a code dependency) |
| 🟠 Watch | Zitadel, ToolJet, Lago, Typesense | AGPL/GPL | Fine as unmodified services, but they add review burden | Chosen alternatives are MIT/Apache |

**License of your own code:** everything you write can be **MIT/Apache or proprietary**. Nothing in the chosen stack is linked copyleft. Only the worker scripts that import `bpy` should be kept GPL-compatible.

---

## 23. OSS projects to reuse (by layer)

- **App:** Next.js · Payload (+ multi-tenant, storage-s3, seo, mcp, import-export plugins) · shadcn/ui · Radix · Tailwind · Zod · Uppy
- **3D/AR:** model-viewer · Three.js · glTF-Transform · meshoptimizer · KTX-Software · glTF-Validator
- **Reconstruction:** COLMAP · OpenMVS · Blender · TRELLIS.2 (fallback) · (Meshroom as plan B)
- **Data:** PostgreSQL · pg-boss · Drizzle (via Payload) · Prisma (optional read-side)
- **Infra:** Docker · Caddy · SeaweedFS · imgproxy · Coolify · Umami · Prometheus/Grafana/Loki (optional)
- **QR/Print:** node-qrcode · qr-code-styling · react-pdf
- **Phase 2:** Better Auth · BullMQ + Redis/Valkey · Meilisearch CE · Kill Bill · Cal · PostHog · Keycloak (franchise SSO)

## 24. Top 20 GitHub repositories worth integrating

| # | Repo | License | ★ | Where it plugs in |
|---|---|---|---|---|
| 1 | payloadcms/payload | MIT | 45.0k | Admin, API, auth, tenancy, media |
| 2 | vercel/next.js | MIT | 142.4k | App runtime, public menu SSR/ISR |
| 3 | google/model-viewer | Apache-2.0 | 8.3k | 3D viewer + AR |
| 4 | shadcn-ui/ui | MIT | 124.6k | UI system |
| 5 | tailwindlabs/tailwindcss | MIT | 97.7k | Styling/theming |
| 6 | colmap/colmap | BSD-3 | 12.8k | SfM |
| 7 | cdcseacave/openMVS | AGPL-3.0 (CLI) | 4.1k | Dense mesh + texture |
| 8 | blender/blender | GPL-3.0 (tool) | 20.5k | Mesh cleanup/scale/USDZ |
| 9 | donmccurdy/glTF-Transform | MIT | 2.0k | GLB optimisation |
| 10 | zeux/meshoptimizer | MIT | 8.4k | Geometry compression |
| 11 | KhronosGroup/KTX-Software | Apache-2.0 | 1.4k | Texture compression |
| 12 | microsoft/TRELLIS.2 | MIT | 11.4k | AI 3D fallback |
| 13 | timgit/pg-boss | MIT | 4.0k | Job queue |
| 14 | seaweedfs/seaweedfs | Apache-2.0 | 35.0k | S3 storage |
| 15 | caddyserver/caddy | Apache-2.0 | 76.1k | Edge, TLS, custom domains |
| 16 | transloadit/uppy | MIT | 31.0k | Photo capture uploads |
| 17 | lovell/sharp | Apache-2.0 | 32.7k | Image optimisation |
| 18 | soldair/node-qrcode | MIT | 8.2k | QR |
| 19 | umami-software/umami | MIT | 39.0k | Privacy-friendly analytics |
| 20 | coollabsio/coolify | Apache-2.0 | 62.3k | Self-hosted PaaS deploys |

Honourable mentions: better-auth (Phase 2), bullmq, meilisearch, killbill, microsoft/playwright, diegomura/react-pdf, imgproxy.
