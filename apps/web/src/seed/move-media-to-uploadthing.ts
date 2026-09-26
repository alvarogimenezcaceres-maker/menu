/**
 * One-time move of the photos and 3D models in apps/web/media to UploadThing.
 * Run by infra/migrar-a-la-nube.sh with NODE_ENV=production, DATABASE_URL (cloud DB) and
 * UPLOADTHING_TOKEN set. Files are uploaded as they are (no re-processing) and the file keys are
 * saved on each media doc. Safe to run again: docs that already have a key are skipped.
 */
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import { UTApi, UTFile } from 'uploadthing/server'

import config from '../payload.config'

const MEDIA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../media')
const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
}

if (!process.env.UPLOADTHING_TOKEN) throw new Error('Falta UPLOADTHING_TOKEN')
const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN })

async function upload(filename: string): Promise<string> {
  const bytes = await readFile(path.join(MEDIA_DIR, filename))
  const type = TYPES[path.extname(filename).toLowerCase()] ?? 'application/octet-stream'
  const res = await utapi.uploadFiles(new UTFile([new Blob([bytes], { type })], filename), { acl: 'public-read' })
  if (res.error) throw new Error(`${filename}: ${res.error.message}`)
  return res.data.key
}

type MediaRow = {
  id: number
  filename?: string | null
  _key?: string | null
  sizes?: { thumbnail?: { filename?: string | null; _key?: string | null } & Record<string, unknown> }
}

const payload = await getPayload({ config })
const { docs } = await payload.find({ collection: 'media', limit: 1000, depth: 0, overrideAccess: true })
let moved = 0
for (const doc of docs as unknown as MediaRow[]) {
  if (!doc.filename || doc._key) continue
  const data: Record<string, unknown> = { _key: await upload(doc.filename) }
  const thumb = doc.sizes?.thumbnail
  if (thumb?.filename && !thumb._key) data.sizes = { thumbnail: { ...thumb, _key: await upload(thumb.filename) } }
  await payload.update({ collection: 'media', id: doc.id, data, depth: 0, overrideAccess: true })
  moved++
  console.log(`  ✓ ${doc.filename}`)
}
console.log(`Listo: ${moved} archivos subidos a UploadThing (${docs.length - moved} ya estaban).`)
process.exit(0)
