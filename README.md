# 3D Restaurant Menu: Architecture & OSS Research

Self-hosted, 100% open-source platform for restaurants to publish mobile menus with 3D dishes and browser AR ("View On My Table"). Research data (stars, licenses, activity) was pulled live from GitHub on **2026-09-25**.

## Deliverables index

| # | Deliverable | Where |
|---|---|---|
| 1 | Open Source Market Analysis | [docs/01-market-analysis.md §1](docs/01-market-analysis.md) |
| 2 | Build vs Buy | [docs/01 §2](docs/01-market-analysis.md#2-build-vs-buy-reuse-analysis) |
| 3 | Recommended Stack | [docs/02-architecture.md §3](docs/02-architecture.md) |
| 4 | License Risk Review | [docs/01 §4](docs/01-market-analysis.md#4-license-risk-review) |
| 5 | Architecture Diagram | [docs/02 §5](docs/02-architecture.md#5-architecture-diagram) |
| 6 | ERD | [docs/03-data-model-and-api.md §6](docs/03-data-model-and-api.md) |
| 7 | PostgreSQL Schema | [db/schema.sql](db/schema.sql) (tested on PostgreSQL 18: RLS + FTS verified) |
| 8 | Prisma Schema | [db/schema.prisma](db/schema.prisma) (passes `prisma validate`) |
| 9 | API Design | [docs/03 §9](docs/03-data-model-and-api.md#9-api-design) |
| 10 | Folder Structure | [docs/05-delivery.md §10](docs/05-delivery.md) |
| 11 | Docker Architecture | [docs/02 §11](docs/02-architecture.md#11-docker-architecture) · [infra/docker-compose.yml](infra/docker-compose.yml) · [infra/Caddyfile](infra/Caddyfile) |
| 12 | Object Storage Design | [docs/02 §12](docs/02-architecture.md#12-object-storage-design) |
| 13 | Photogrammetry Pipeline | [docs/04-photogrammetry-pipeline.md](docs/04-photogrammetry-pipeline.md) |
| 14 | AR Architecture | [docs/02 §14](docs/02-architecture.md#14-ar-architecture-view-on-my-table) |
| 15 | Multi-Tenant Strategy | [docs/02 §15](docs/02-architecture.md#15-multi-tenant-strategy) |
| 16 | Security Model | [docs/02 §16](docs/02-architecture.md#16-security-model) |
| 17 | Scaling Strategy | [docs/02 §17](docs/02-architecture.md#17-scaling-strategy) |
| 18 | Infrastructure Requirements | [docs/02 §18](docs/02-architecture.md#18-infrastructure-requirements) |
| 19 | Cost Estimates | [docs/02 §19](docs/02-architecture.md#19-cost-estimates-usdmonth-sept-2026-street-prices-verify-before-buying) |
| 20 | Roadmap | [docs/05 §20](docs/05-delivery.md#20-development-roadmap-1-senior-full-stack-dev-plus-claude-code-halve-the-calendar-with-2-devs) |
| 21 | Repository Structure | [docs/05 §21](docs/05-delivery.md) |
| 22 | CI/CD | [docs/05 §22](docs/05-delivery.md#22-cicd-pipeline) |
| 23 | OSS To Reuse | [docs/01 §23](docs/01-market-analysis.md#23-oss-projects-to-reuse-by-layer) |
| 24 | Top 20 Repos | [docs/01 §24](docs/01-market-analysis.md#24-top-20-github-repositories-worth-integrating) |
| 25 | Final Recommendation | below |
| — | First tenant migration: Filigrana | [seed/filigrana/](seed/filigrana/menu.json) (102 items, 27 images, `seed.sql`) |

---

## 25. Final recommendation

**Build it as one Next.js app with Payload CMS inside it, plus one GPU worker.** Don't build a custom admin, don't run Keycloak, don't add Redis, and don't write custom AR code.

```
Next.js + Payload 3 (MIT)  ── admin, auth, API, multi-tenant, media, public menu (ISR)
PostgreSQL 17              ── data + RLS isolation + full-text search + pg-boss queue
SeaweedFS (Apache-2.0)     ── S3 storage (any S3 works; MinIO is archived → avoid)
<model-viewer> (Apache-2.0)── 3D viewer + AR on Android (WebXR/Scene Viewer) and iOS (Quick Look)
COLMAP → OpenMVS → Blender → glTF-Transform ── photos → ≤3 MB GLB + USDZ, TRELLIS.2 as AI fallback
Caddy                      ── HTTPS, custom domains via on-demand TLS
Docker Compose → Coolify   ── self-hosted deploys on any Linux VPS
shadcn/ui + Tailwind       ── mobile-first UI, per-restaurant theming
```

**Why this is the fastest honest path:**
1. **About 70% of the MVP is configuration, not code.** Payload's multi-tenant, storage-s3, seo and mcp plugins plus model-viewer's AR modes cover CRUD, media, auth, tenancy, 3D and AR. Custom code is about 4–5k LOC: the public menu UI and the 3D worker.
2. **Launch in 4 weeks** with uploaded GLBs (sellable). Add self-serve photogrammetry in weeks 5–6 as the differentiator.
3. **The license picture is clean.** Everything linked into your app is MIT/Apache/BSD. The AGPL/GPL tools (OpenMVS, Blender) run unmodified as CLIs inside the worker. Directus (source-available), MinIO (archived), Needle, Inria 3DGS and Hunyuan3D were rejected on license grounds.
4. **It's cheap.** About $20–30/month for a pilot and about $100/month for 100 restaurants. GPU time is roughly $0.05–0.25 per dish model and is metered per tenant, so it's billable.
5. **The SaaS runway is built in.** The Tenant ≠ Restaurant split (franchises), RLS, custom domains, plans/usage counters and reserved Phase 2 namespaces (orders, payments, WhatsApp, reservations, loyalty) all slot into the same app as new Payload collections.

**Three risks to manage:**
- **Food photogrammetry quality.** Glossy and liquid dishes fail. Mitigate with the capture guide, a ChArUco scale mat, the AI fallback and manual upload. Consider offering "we scan for you" early.
- **Payload owns the schema.** Keep `db/schema.sql` as the reference model and apply RLS through a custom migration. Only use Prisma read-side, or in the Plan B stack.
- **model-viewer is in slow maintenance.** The API is stable and Three.js underneath is very active. If it ever stalls, the fallback is R3F + `@react-three/xr` + Quick Look links. The same GLB/USDZ assets work unchanged.

**Plan B** (if you reject Payload): Refine + shadcn admin, a Hono API with Prisma (`db/schema.prisma` becomes the source of truth) and Better Auth. Same infra and worker. Expect about 2–3 extra weeks.

**Next step:** scaffold with `pnpm create payload-app` (Next.js + Postgres template) into `apps/web`, add `plugin-multi-tenant` + `storage-s3`, and apply `db/schema.sql`'s RLS as the first custom migration. Week 0 of the roadmap.
