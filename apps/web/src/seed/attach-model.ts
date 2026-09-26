/**
 * Attaches a generated 3D model (and optional poster photo) to a dish.
 *   npm run attach-model -- <restaurant-slug> <dish-slug> <model.glb> [poster.png] ["nota del modelo"]
 * Same result as uploading the files by hand in the dish form.
 */
import path from 'path'
import { getPayload } from 'payload'

import config from '../payload.config'

const [restaurantSlug, dishSlug, glb, poster, note] = process.argv.slice(2)
if (!restaurantSlug || !dishSlug || !glb) {
  console.error('Uso: npm run attach-model -- <restaurante> <plato> <modelo.glb> [poster.png] ["nota"]')
  process.exit(1)
}

const payload = await getPayload({ config })
const restaurant = (await payload.find({ collection: 'restaurants', where: { slug: { equals: restaurantSlug } }, limit: 1 })).docs[0]
if (!restaurant) throw new Error(`No existe el restaurante "${restaurantSlug}"`)
const dish = (
  await payload.find({
    collection: 'dishes',
    where: { and: [{ slug: { equals: dishSlug } }, { tenant: { equals: restaurant.id } }] },
    limit: 1,
    depth: 0,
  })
).docs[0]
if (!dish) throw new Error(`No existe el plato "${dishSlug}" en ${restaurant.name}`)

const model = await payload.create({
  collection: 'media',
  data: { alt: `Modelo 3D de ${dish.name}`, tenant: restaurant.id },
  filePath: path.resolve(glb),
})
const photo = poster
  ? await payload.create({ collection: 'media', data: { alt: dish.name, tenant: restaurant.id }, filePath: path.resolve(poster) })
  : null

await payload.update({
  collection: 'dishes',
  id: dish.id,
  data: {
    model: model.id,
    ...(photo && !dish.photo ? { photo: photo.id } : {}),
    ...(note ? { modelNote: note } : {}),
  },
})
payload.logger.info(`✓ ${dish.name}: modelo 3D ${model.filename}${photo && !dish.photo ? ` y foto ${photo.filename}` : ''}`)
process.exit(0)
