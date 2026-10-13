import { randomBytes } from 'crypto'
import type { Endpoint } from 'payload'

import { isPlatformAdmin } from '../access/roles'
import { PLAN_OPTIONS } from '../plans'

type SeedDish = {
  slug: string
  name: string
  description?: string
  price?: number | null
  ingredients?: string[]
  tags?: string[]
  options?: { group: string; multiple?: boolean; required?: boolean; choices?: string[]; items?: { name: string; price?: number }[] }[]
  photo?: string
  modelNote?: string
  status?: string
  review?: string
}
type SeedMenu = {
  restaurant: {
    name: string
    slug: string
    description?: string
    tagline?: string
    currency?: string
    logo?: string
    hero?: string
    tables?: number
    whatsapp?: string
    cuisine?: string[]
    theme?: Record<string, string>
    orderingMode?: string
    reservations?: boolean
    headerCenter?: boolean
  }
  categories: { slug: string; name: string; description?: string; cover?: string; dishes: SeedDish[] }[]
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
const repo = () => process.env.GITHUB_REPO || 'alvarogimenezcaceres-maker/menu'
const rawUrl = (slug: string, rel: string) => `https://raw.githubusercontent.com/${repo()}/main/seed/${slug}/${rel}`
const panelUrl = () => (process.env.PANEL_URL || 'https://panel.mesaverso.app').replace(/\/+$/, '')

/**
 * POST /api/restaurants/import-seed {slug, plan?}: platform admins only. Creates a restaurant in the panel from
 * seed/<slug>/ in the public repository (menu, logo and photos), and returns a one-time activation link: the
 * restaurant's owner opens it, registers with their own email and password, and becomes the restaurant's admin.
 */
export const importSeedEndpoint: Endpoint = {
  path: '/import-seed',
  method: 'post',
  handler: async (req) => {
    if (!isPlatformAdmin(req.user)) return Response.json({ message: 'Solo el administrador de la plataforma puede importar un local.' }, { status: 403 })
    let body: { slug?: unknown; plan?: unknown }
    try {
      body = (await req.json?.()) as typeof body
    } catch {
      return Response.json({ message: 'No pudimos leer el pedido.' }, { status: 400 })
    }
    const slug = String(body?.slug ?? '').trim()
    if (!/^[a-z0-9](-?[a-z0-9]){1,40}$/.test(slug)) return Response.json({ message: 'Escribí el identificador del local en minúsculas, por ejemplo frakar.' }, { status: 400 })
    const plan = PLAN_OPTIONS.some((p) => p.value === body?.plan) ? (body.plan as 'free' | 'menu' | 'pedidos' | 'salon') : 'menu'
    const { payload } = req

    const existing = await payload.count({ collection: 'restaurants', where: { slug: { equals: slug } }, overrideAccess: true })
    if (existing.totalDocs > 0) return Response.json({ message: `«${slug}» ya existe en el panel.` }, { status: 409 })

    const res = await fetch(rawUrl(slug, 'menu.json'))
    if (!res.ok) return Response.json({ message: `No encontré seed/${slug}/menu.json en el repositorio (¿ya se subió?).` }, { status: 404 })
    const menu = JSON.parse(await res.text()) as SeedMenu
    const r = menu.restaurant

    let tenant: number | string | undefined
    try {
      const code = randomBytes(18).toString('base64url')
      const restaurant = await payload.create({
        collection: 'restaurants',
        data: {
          name: r.name,
          slug,
          plan,
          publishApproved: true,
          tagline: r.tagline,
          description: r.description,
          currency: (r.currency as 'PYG' | 'USD') ?? 'PYG',
          tables: r.tables ?? 0,
          whatsapp: r.whatsapp,
          whatsappOnly: r.orderingMode === 'whatsapp',
          reservationsWhatsapp: r.reservations === true,
          headerCenter: r.headerCenter === true,
          cuisine: r.cuisine ?? [],
          theme: { primary: r.theme?.primary, primaryLight: r.theme?.primaryLight, background: r.theme?.background, accentWine: r.theme?.accentWine },
          claimCode: code,
        },
        overrideAccess: true,
      })
      tenant = restaurant.id

      // images: the names in the menu may be png, jpg or webp
      const names = new Set<string>()
      if (r.logo) names.add(r.logo)
      if (r.hero) names.add(r.hero)
      for (const c of menu.categories) {
        if (c.cover) names.add(c.cover)
        for (const d of c.dishes) if (d.photo) names.add(d.photo)
      }
      const mediaIds = new Map<string, number | string>()
      for (const name of names) {
        for (const ext of Object.keys(MIME)) {
          const f = await fetch(rawUrl(slug, `images/${name}${ext}`))
          if (!f.ok) continue
          const data = Buffer.from(await f.arrayBuffer())
          const doc = await payload.create({
            collection: 'media',
            data: { alt: name.replace(/-/g, ' '), tenant },
            file: { data, mimetype: MIME[ext], name: `${name}${ext}`, size: data.length },
            overrideAccess: true,
          })
          mediaIds.set(name, doc.id)
          break
        }
      }
      await payload.update({
        collection: 'restaurants',
        id: tenant,
        data: { logo: r.logo ? (mediaIds.get(r.logo) as number | undefined) : undefined, hero: r.hero ? (mediaIds.get(r.hero) as number | undefined) : undefined },
        overrideAccess: true,
      })

      let dishCount = 0
      for (const c of menu.categories) {
        const cat = await payload.create({
          collection: 'categories',
          data: { name: c.name, slug: c.slug, description: c.description, cover: c.cover ? (mediaIds.get(c.cover) as number | undefined) : undefined, tenant },
          overrideAccess: true,
        })
        for (const d of c.dishes) {
          await payload.create({
            collection: 'dishes',
            data: {
              name: d.name,
              slug: d.slug,
              category: cat.id,
              price: d.price ?? null,
              description: d.description,
              ingredients: d.ingredients ?? [],
              tags: d.tags ?? [],
              options: (d.options ?? []).map((o) => ({
                group: o.group,
                multiple: Boolean(o.multiple),
                required: o.required ?? !o.multiple,
                items: o.items?.length ? o.items.map((i) => ({ name: i.name, price: i.price || 0 })) : (o.choices ?? []).map((n) => ({ name: n, price: 0 })),
              })),
              photo: d.photo ? (mediaIds.get(d.photo) as number | undefined) : undefined,
              modelNote: d.modelNote,
              visible: d.status !== 'draft',
              internalNote: d.review,
              tenant,
            },
            overrideAccess: true,
          })
          dishCount++
        }
      }
      return Response.json({
        ok: true,
        restaurant: r.name,
        categories: menu.categories.length,
        dishes: dishCount,
        photos: mediaIds.size,
        inviteUrl: `${panelUrl()}/registro?codigo=${code}`,
      })
    } catch (err) {
      payload.logger.error({ err }, 'import-seed failed')
      // do not leave a half-imported restaurant behind
      if (tenant != null) {
        await payload.delete({ collection: 'dishes', where: { tenant: { equals: tenant } }, overrideAccess: true }).catch(() => {})
        await payload.delete({ collection: 'categories', where: { tenant: { equals: tenant } }, overrideAccess: true }).catch(() => {})
        await payload.delete({ collection: 'media', where: { tenant: { equals: tenant } }, overrideAccess: true }).catch(() => {})
        await payload.delete({ collection: 'restaurants', id: tenant, overrideAccess: true }).catch(() => {})
      }
      return Response.json({ message: 'No se pudo importar el local. No se creó nada; revisá el menú del repositorio.' }, { status: 500 })
    }
  },
}
