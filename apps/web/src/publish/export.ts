import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Payload } from 'payload'

import type { Category, Dish, Media, Restaurant } from '../payload-types'
import { slugify } from '../fields/slug'

const dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(dirname, '../../../..')
const MEDIA_DIR = path.resolve(dirname, '../../media')

type Rel<T> = number | T | null | undefined
const asDoc = <T>(v: Rel<T>): T | null => (v && typeof v === 'object' ? v : null)

/** Folders inside seed/<slug>/ that the export owns: files there that are no longer used get removed. */
export const OWNED_DIRS = ['images', 'models']

/** Reads a media file from apps/web/media, or downloads it from cloud storage (UploadThing). */
async function mediaBytes(doc: Media): Promise<Buffer> {
  try {
    return await readFile(path.join(MEDIA_DIR, doc.filename!))
  } catch {
    if (!doc.url?.startsWith('http')) throw new Error(`No se encontró el archivo ${doc.filename}`)
    const res = await fetch(doc.url)
    if (!res.ok) throw new Error(`No se pudo descargar ${doc.filename} (${res.status})`)
    return Buffer.from(await res.arrayBuffer())
  }
}

/**
 * Builds seed/<slug>/menu.json plus images/ and models/ in the format site/build.mjs reads.
 * Returns the files keyed by path relative to seed/<slug>/; a publisher writes them to git.
 */
export async function exportRestaurant(payload: Payload, restaurantId: number | string) {
  const r = (await payload.findByID({ collection: 'restaurants', id: restaurantId, depth: 1, overrideAccess: true })) as Restaurant
  const where = { tenant: { equals: r.id } }
  const categories = (await payload.find({ collection: 'categories', where, sort: '_order', limit: 500, depth: 1, overrideAccess: true })).docs as Category[]
  const dishes = (await payload.find({ collection: 'dishes', where, sort: '_order', limit: 2000, depth: 1, overrideAccess: true })).docs as Dish[]

  const images = new Map<string, Media>() // export file name -> media doc
  const models = new Map<string, Media>()
  const image = (m: Rel<Media>): string | undefined => {
    const doc = asDoc(m)
    if (!doc?.filename) return undefined
    const ext = path.extname(doc.filename).toLowerCase()
    const name = slugify(path.basename(doc.filename, ext)) || `media-${doc.id}`
    images.set(`${name}${ext}`, doc)
    return name
  }
  const model = (m: Rel<Media>): string | undefined => {
    const doc = asDoc(m)
    if (!doc?.filename) return undefined
    models.set(doc.filename, doc)
    return doc.filename
  }

  const menu = {
    $source: 'Exportado desde el panel de administración',
    tenant: { name: r.name, slug: r.slug },
    restaurant: {
      name: r.name,
      slug: r.slug,
      description: r.description ?? '',
      tagline: r.tagline ?? '',
      currency: r.currency ?? 'PYG',
      default_locale: 'es',
      logo: image(r.logo),
      hero: image(r.hero),
      tables: r.tables ?? 0,
      whatsapp: r.whatsapp || undefined,
      cuisine: r.cuisine ?? [],
      googleReviewUrl: r.googleReviewUrl?.trim() || undefined,
      ordering: {
        orderTypes: r.orderTypes?.length ? r.orderTypes : undefined,
        paymentMethods: r.paymentMethods?.length ? r.paymentMethods : undefined,
        deliveryFee: r.deliveryFee ?? undefined,
        minOrder: r.minOrder || undefined,
        deliveryZones: r.deliveryZones?.length ? r.deliveryZones.map((z) => ({ name: z.name, fee: z.fee })) : undefined,
        transferInfo: r.transferInfo || undefined,
        hours: r.hours?.length
          ? r.hours.map((h) => ({ days: h.days ?? [], open: h.open.trim(), close: h.close.trim() }))
          : undefined,
      },
      theme: {
        primary: r.theme?.primary,
        primaryLight: r.theme?.primaryLight,
        background: r.theme?.background,
        accentWine: r.theme?.accentWine,
      },
    },
    categories: categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description || undefined,
      cover: image(c.cover),
      dishes: dishes
        .filter((d) => (asDoc(d.category as Rel<Category>)?.id ?? d.category) === c.id)
        .map((d) => ({
          slug: d.slug,
          name: d.name,
          description: d.description || undefined,
          price: d.price ?? null,
          ingredients: d.ingredients?.length ? d.ingredients : undefined,
          tags: d.tags?.length ? d.tags : undefined,
          options: d.options?.length
            ? d.options.map((o) => ({
                group: o.group,
                multiple: Boolean(o.multiple),
                required: o.required ?? !o.multiple,
                // dishes saved before option prices existed still only have `choices`
                items: o.items?.length
                  ? o.items.map((i) => ({ name: i.name, price: i.price || 0 }))
                  : (o.choices ?? []).map((name) => ({ name, price: 0 })),
              }))
            : undefined,
          photo: image(d.photo),
          model: model(d.model),
          modelNote: d.modelNote || undefined,
          soldOut: d.soldOut || undefined,
          status: d.visible === false ? 'draft' : undefined,
        })),
    })),
  }

  const files = new Map<string, Buffer>([['menu.json', Buffer.from(JSON.stringify(menu, null, 2) + '\n', 'utf8')]])
  for (const [dir, docs] of [['images', images], ['models', models]] as const) {
    for (const [name, doc] of docs) files.set(`${dir}/${name}`, await mediaBytes(doc))
  }

  const published = menu.categories.reduce((n, c) => n + c.dishes.filter((d) => d.price != null && !d.status).length, 0)
  return { slug: r.slug, name: r.name, relDir: path.posix.join('seed', r.slug), published, files }
}
