# 03 · Data Model & API

Deliverables: **#6 ERD · #7 PostgreSQL schema (`db/schema.sql`) · #8 Prisma schema (`db/schema.prisma`) · #9 API design**

---

## 6. ERD

```
                         ┌──────────┐        ┌────────────────┐
                         │  plans   │1──────*│ subscriptions  │
                         └────┬─────┘        └───────┬────────┘
                              │1                     │*
                              │*                     │1
 ┌───────┐ *   ┌─────────────┐1┴──────────────────────┴──┐1     * ┌────────────────┐
 │ users │─────│ memberships │*──────────1│   tenants    │───────│ usage_counters │
 └───┬───┘     │ (role)      │            └──────┬───────┘       └────────────────┘
     │         └─────────────┘                   │1
     │ created_by                                │*   (every table below carries tenant_id + RLS)
     │                                   ┌───────▼────────┐1     * ┌──────────────────┐
     │                                   │  restaurants   │────────│  custom_domains  │
     │                                   │ slug, theme,   │        └──────────────────┘
     │                                   │ logo_id,cover_id│1    * ┌──────────────────┐
     │                                   └───┬────────┬───┘────────│ restaurant_tables│ (QR ?table=)
     │                                       │1       │1           └──────────────────┘
     │                                       │*       │*
     │                               ┌───────▼───┐ *  │
     │                               │categories │────┤
     │                               │ position  │1   │
     │                               └───────────┘  * ▼
     │                                         ┌──────────────┐  active_model_id  ┌──────────────┐
     │                                         │    dishes    │──────────────────►│  models_3d   │
     │                                         │ price_minor, │1                 *│ version,     │
     │                                         │ ingredients, │──────────────────►│ source,status│
     │                                         │ allergens,   │                   │ glb/usdz/    │
     │                                         │ plate_cm     │                   │ poster → media│
     │                                         └──┬────────┬──┘                   └──────▲───────┘
     │                                            │1       │1                            │
     │                                          * │        │*                            │
     │                                  ┌─────────▼──┐  ┌──▼─────────┐ 1          *      │
     │                                  │dish_photos │  │  captures  │─────────────────────┘
     │                                  │ position   │  │  status    │1       * ┌─────────────────┐
     │                                  └─────┬──────┘  └──┬─────────┘──────────│ processing_jobs │
     │                                        │*           │1                   │ stage,progress  │
     │                                        │            │*                   └─────────────────┘
     │                                        │     ┌──────▼────────┐
     │                                        │     │capture_photos │
     │                                        │     └──────┬────────┘
     │                                        ▼1           ▼1
     └──────────────────────────────────►┌──────────────────────┐
                                         │        media         │  bucket, storage_key, mime, bytes,
                                         │  (all stored objects)│  sha256, w/h, variants
                                         └──────────────────────┘

  menu_events (partitioned, append-only)   audit_logs (append-only)
```

Key modelling decisions:
- **Tenant ≠ Restaurant.** A tenant can own many restaurants (franchises/locations).
- **Money** is stored as `price_minor bigint` + restaurant `currency` (JPY/PYG use 0 decimals, USD uses 2). No floats.
- **`models_3d` is versioned.** `dishes.active_model_id` points to the published version, so rollback is one update.
- **`captures`** separate *input* (photo sets) from *output* (models). One capture can produce several attempts or versions.
- **`processing_jobs`** holds user-visible progress. pg-boss owns the actual queue table (`pgboss.job`).
- **`plate_diameter_cm`** drives real-world AR scale.
- **i18n** uses a JSONB `i18n` column on categories and dishes for the MVP. Payload's native field localization replaces this if you go all-in on Payload (recommended).

### ORM note (read this before coding)
With **Payload as system of record**, Payload's collections generate the tables through its Drizzle adapter (`payload migrate:create`). Column names differ slightly (Payload uses `_rels` tables for relationships and `_locales` tables for localization).
- **`db/schema.sql`** is the **reference model**. Its RLS policies, generated `tsvector`, partitioning and roles are applied as a **custom Payload migration** (`payload migrate:create --name rls`).
- **`db/schema.prisma`** is for (a) the **Plan B** stack (Refine + Hono + Prisma, if you ever drop Payload) or (b) read-only services. In case (b), run `prisma db pull` against the live DB and never `prisma migrate`.
- **Never let two ORMs run migrations on the same database.**

RLS with Prisma (read-side) uses a client extension:
```ts
export const forTenant = (tenantId: string) => prisma.$extends({
  query: { $allModels: { async $allOperations({ args, query }) {
    const [, result] = await prisma.$transaction([
      prisma.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`,
      query(args),
    ]);
    return result;
  }}},
});
```

---

## 9. API design

Three surfaces, all served by the same Next.js + Payload process:

| Surface | Consumer | Auth | Generated? |
|---|---|---|---|
| **Payload REST** `/api/{collection}` + **GraphQL** `/api/graphql` | Admin UI, integrations, Claude (via MCP plugin) | Cookie (staff) / API key per tenant | **Auto-generated** from collections |
| **Public Menu API** `/api/public/v1/*` | Public menu pages, future native apps, partners | None (published data only), rate-limited, cached | Hand-written, ~5 routes |
| **Worker API** `/api/internal/v1/*` | GPU workers | HMAC-signed service token, internal network only | Hand-written, ~3 routes |

### 9.1 Payload REST (auto) — highlights
```
POST   /api/users/login                      staff login (cookie + JWT)
GET    /api/restaurants?where[tenant][equals]=…&depth=1
POST   /api/restaurants                      {name, slug, description, logo, cover, theme}
PATCH  /api/restaurants/:id
DELETE /api/restaurants/:id                  soft delete via hook
GET    /api/categories?where[restaurant][equals]=:rid&sort=position
POST   /api/categories                       {restaurant, name, position}
PATCH  /api/categories/:id                   {position}   ← drag-and-drop reorder
GET    /api/dishes?where[category][equals]=:cid&sort=position&depth=2
POST   /api/dishes                           {restaurant, category, name, description, ingredients[], allergens[], priceMinor, photos[]}
PATCH  /api/dishes/:id                       {activeModel, isAvailable, status}
POST   /api/media                            multipart upload (images, GLB, USDZ) → sharp sizes → S3
```
Every collection's `access.read/create/update/delete` is `tenantScoped(role)`. Payload hooks handle the side effects:
- `afterChange(dish|category|restaurant)` → `revalidateTag('restaurant:'+id)`
- `afterChange(capture.status='queued')` → `boss.send('reconstruct', {...})`

### 9.2 Custom endpoints (Payload `endpoints` or Next route handlers)
```
POST /api/captures                              create capture for dish → {captureId}
POST /api/captures/:id/uploads                  → presigned multipart URLs for N photos (Uppy)
POST /api/captures/:id/submit                   {quality:'fast'|'standard'|'high', method:'photogrammetry'|'ai'}
                                                → checks plan quota → enqueue → 202 {jobId}
GET  /api/jobs/:id                              {status, stage, progress, error}
GET  /api/jobs/:id/stream                       SSE progress (admin widget)
POST /api/models/:id/activate                   set dish.active_model_id, revalidate
POST /api/restaurants/:id/qr                    {type:'restaurant'|'table', tableIds?, format:'svg'|'png'|'pdf', style?}
                                                → file (PDF = printable table tents via react-pdf)
POST /api/restaurants/:id/domains               {hostname} → {verificationToken, cnameTarget}
POST /api/restaurants/:id/domains/:did/verify   DNS check
GET  /api/domains/verify?domain=…               Caddy on-demand TLS "ask" (200 only if verified)
```

### 9.3 Public Menu API v1 (cache: `s-maxage=60, stale-while-revalidate=86400`, ETag)
```
GET  /api/public/v1/menus/:restaurantSlug
     → { restaurant:{name,slug,description,logo,cover,theme,currency,locales,contact},
         categories:[{id,name,slug,position,
           dishes:[{id,slug,name,description,ingredients,allergens,tags,price,isAvailable,
                    photos:[{url,w,h,alt,srcset}],
                    model:{glb,usdz,poster,bytes,bboxM,viewerOpts}|null }]}] }
GET  /api/public/v1/menus/:restaurantSlug/dishes/:dishSlug
GET  /api/public/v1/menus/:restaurantSlug/search?q=salmon&locale=es     (Postgres FTS)
POST /api/public/v1/events   {restaurantSlug, dishId?, table?, event, uaClass}  → 204  (rate-limited, no cookies)
```
The Next.js pages call the **Payload Local API** directly (no HTTP hop). The public REST exists for PWA/native/partners.

### 9.4 Internal Worker API (HMAC `X-Signature: sha256(body, WORKER_SECRET)`)
```
POST /api/internal/v1/jobs/:id/progress   {stage, progress, log?}
POST /api/internal/v1/jobs/:id/complete   {glbKey, usdzKey, posterKey, triangles, bytes, bboxM, validation}
POST /api/internal/v1/jobs/:id/fail       {error, retryable}
```
The worker receives the jobs themselves from **pg-boss** (`boss.work('reconstruct', …)`). These endpoints only report back, so the worker never needs DB write access beyond pg-boss.

### 9.5 Public routes (pages)
```
/{restaurantSlug}                     menu (ISR, tag restaurant:{id})
/{restaurantSlug}?table=8             same page, table stored in sessionStorage + event
/{restaurantSlug}/{dishSlug}          dish deep-link (OG image = poster/photo, JSON-LD Menu/MenuItem)
/{restaurantSlug}/qr                  (admin-only) printable sheet
/admin/**                             Payload admin
```
**SEO:** `generateMetadata` per restaurant/dish, schema.org `Restaurant` + `Menu` + `MenuSection` + `MenuItem` JSON-LD, `sitemap.ts` listing published restaurants, `hreflang` for locales, OG images via `next/og`.

### 9.6 Phase-2 API namespaces (reserved)
`/api/public/v1/orders` · `/api/public/v1/reservations` · `/api/webhooks/{whatsapp|payments/:provider}` · `/api/public/v1/customers/*` (Better Auth) · `/api/v1/analytics/*`
