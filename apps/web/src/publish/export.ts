import { copyFile, mkdir, readdir, rm, writeFile } from 'fs/promises'
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

/**
 * Writes seed/<slug>/menu.json plus images/ and models/ in the format site/build.mjs reads.
 * Returns the repo-relative folder that changed.
 */
export async function exportRestaurant(payload: Payload, restaurantId: number | string) {
  const r = (await payload.findByID({ collection: 'restaurants', id: restaurantId, depth: 1, overrideAccess: true })) as Restaurant
  const where = { tenant: { equals: r.id } }
  const categories = (await payload.find({ collection: 'categories', where, sort: '_order', limit: 500, depth: 1, overrideAccess: true })).docs as Category[]
  const dishes = (await payload.find({ collection: 'dishes', where, sort: '_order', limit: 2000, depth: 1, overrideAccess: true })).docs as Dish[]

  const outDir = path.join(REPO_ROOT, 'seed', r.slug)
  const imgDir = path.join(outDir, 'images')
  const modelDir = path.join(outDir, 'models')
  await mkdir(imgDir, { recursive: true })
  await mkdir(modelDir, { recursive: true })

  const images = new Map<string, string>() // export name -> source file
  const models = new Map<string, string>()
  const image = (m: Rel<Media>): string | undefined => {
    const doc = asDoc(m)
    if (!doc?.filename) return undefined
    const ext = path.extname(doc.filename).toLowerCase()
    const name = slugify(path.basename(doc.filename, ext)) || `media-${doc.id}`
    images.set(`${name}${ext}`, path.join(MEDIA_DIR, doc.filename))
    return name
  }
  const model = (m: Rel<Media>): string | undefined => {
    const doc = asDoc(m)
    if (!doc?.filename) return undefined
    models.set(doc.filename, path.join(MEDIA_DIR, doc.filename))
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
      cuisine: r.cuisine ?? [],
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
            ? d.options.map((o) => ({ group: o.group, multiple: Boolean(o.multiple), choices: o.choices ?? [] }))
            : undefined,
          photo: image(d.photo),
          model: model(d.model),
          modelNote: d.modelNote || undefined,
          soldOut: d.soldOut || undefined,
          status: d.visible === false ? 'draft' : undefined,
        })),
    })),
  }

  // copy files; drop the ones no longer used so the repo stays small
  for (const [dir, files] of [[imgDir, images], [modelDir, models]] as const) {
    for (const f of await readdir(dir)) if (!files.has(f)) await rm(path.join(dir, f))
    for (const [name, src] of files) await copyFile(src, path.join(dir, name))
  }
  await writeFile(path.join(outDir, 'menu.json'), JSON.stringify(menu, null, 2) + '\n', 'utf8')

  const published = menu.categories.reduce((n, c) => n + c.dishes.filter((d) => d.price != null && !d.status).length, 0)
  return { slug: r.slug, name: r.name, relDir: path.posix.join('seed', r.slug), published, images: images.size, models: models.size }
}
