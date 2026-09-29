/**
 * Imports seed/<slug>/menu.json (+ images/, models/) into the admin panel.
 *   npm run seed -- filigrana
 * Creates the platform admin (first run) and a staff user for the restaurant.
 * Passwords are written to ../../.local/credenciales.txt (gitignored), never printed.
 */
import { randomBytes } from 'crypto'
import { appendFile, mkdir, readdir, readFile } from 'fs/promises'
import path from 'path'
import { getPayload } from 'payload'

import config from '../payload.config'
import { REPO_ROOT } from '../publish/export'

type SeedDish = {
  slug: string
  name: string
  description?: string
  price?: number | null
  ingredients?: string[]
  tags?: string[]
  options?: { group: string; multiple?: boolean; required?: boolean; choices?: string[]; items?: { name: string; price?: number }[] }[]
  photo?: string
  model?: string
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
  }
  categories: { slug: string; name: string; description?: string; cover?: string; dishes: SeedDish[] }[]
}

const password = () => randomBytes(9).toString('base64url')

async function main() {
  const slug = process.argv[2] || 'filigrana'
  const seedDir = path.join(REPO_ROOT, 'seed', slug)
  const menu = JSON.parse(await readFile(path.join(seedDir, 'menu.json'), 'utf8')) as SeedMenu
  const payload = await getPayload({ config })
  const credFile = path.join(REPO_ROOT, '.local', 'credenciales.txt')
  await mkdir(path.dirname(credFile), { recursive: true })

  const existing = await payload.find({ collection: 'restaurants', where: { slug: { equals: slug } }, limit: 1 })
  if (existing.docs.length) {
    payload.logger.warn(`"${slug}" ya existe en el panel; no se importa de nuevo.`)
    process.exit(0)
  }

  const admins = await payload.count({ collection: 'users', where: { role: { equals: 'admin' } } })
  if (!admins.totalDocs) {
    const pw = password()
    await payload.create({ collection: 'users', data: { email: 'admin@menu3d.local', name: 'Administrador', role: 'admin', password: pw } })
    await appendFile(credFile, `Administrador de la plataforma\n  usuario: admin@menu3d.local\n  clave:   ${pw}\n\n`)
  }

  const r = menu.restaurant
  const restaurant = await payload.create({
    collection: 'restaurants',
    data: {
      name: r.name,
      slug: r.slug,
      tagline: r.tagline,
      description: r.description,
      currency: (r.currency as 'PYG' | 'USD') ?? 'PYG',
      tables: r.tables ?? 10,
      whatsapp: r.whatsapp,
      cuisine: r.cuisine ?? [],
      theme: {
        primary: r.theme?.primary,
        primaryLight: r.theme?.primaryLight,
        background: r.theme?.background,
        accentWine: r.theme?.accentWine,
      },
    },
  })
  const tenant = restaurant.id

  // files
  const mediaIds = new Map<string, number>()
  const imgDir = path.join(seedDir, 'images')
  for (const file of await readdir(imgDir)) {
    const name = path.parse(file).name
    if (mediaIds.has(name)) continue
    const doc = await payload.create({
      collection: 'media',
      data: { alt: name.replace(/-/g, ' '), tenant },
      filePath: path.join(imgDir, file),
    })
    mediaIds.set(name, doc.id)
  }
  const modelIds = new Map<string, number>()
  const modelDir = path.join(seedDir, 'models')
  for (const file of await readdir(modelDir).catch(() => [] as string[])) {
    const doc = await payload.create({
      collection: 'media',
      data: { alt: `Modelo 3D ${path.parse(file).name}`, tenant },
      filePath: path.join(modelDir, file),
    })
    modelIds.set(file, doc.id)
  }

  await payload.update({
    collection: 'restaurants',
    id: tenant,
    data: { logo: r.logo ? mediaIds.get(r.logo) : undefined, hero: r.hero ? mediaIds.get(r.hero) : undefined },
  })

  let dishCount = 0
  for (const c of menu.categories) {
    const cat = await payload.create({
      collection: 'categories',
      data: { name: c.name, slug: c.slug, description: c.description, cover: c.cover ? mediaIds.get(c.cover) : undefined, tenant },
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
            items: o.items?.length ? o.items.map((i) => ({ name: i.name, price: i.price || 0 })) : (o.choices ?? []).map((name) => ({ name, price: 0 })),
          })),
          photo: d.photo ? mediaIds.get(d.photo) : undefined,
          model: d.model ? modelIds.get(d.model) : undefined,
          modelNote: d.modelNote,
          visible: d.status !== 'draft',
          internalNote: d.review,
          tenant,
        },
      })
      dishCount++
    }
  }

  const staffPw = password()
  const staffEmail = `${slug}@menu3d.local`
  await payload.create({
    collection: 'users',
    data: { email: staffEmail, name: `Personal ${r.name}`, role: 'staff', password: staffPw, tenants: [{ tenant }] },
  })
  await appendFile(credFile, `Personal de ${r.name}\n  usuario: ${staffEmail}\n  clave:   ${staffPw}\n\n`)

  payload.logger.info(
    `✓ ${r.name}: ${menu.categories.length} categorías, ${dishCount} ítems, ${mediaIds.size} fotos, ${modelIds.size} modelos 3D. Claves en .local/credenciales.txt`,
  )
  process.exit(0)
}

// top-level await: `payload run` exits as soon as the module finishes loading
try {
  await main()
} catch (e) {
  console.error((e as { data?: { errors?: unknown } }).data?.errors ?? e)
  process.exit(1)
}
