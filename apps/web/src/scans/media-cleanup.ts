import type { Payload, Where } from 'payload'

type FieldLike = {
  type?: string // tabs have none
  name?: string
  relationTo?: string | string[]
  fields?: FieldLike[]
  tabs?: FieldLike[]
  blocks?: { fields: FieldLike[] }[]
}
type CollectionLike = { slug: string; fields: FieldLike[] }

export type MediaReference = { collection: string; path: string }

/** Every upload field that can point at a Media doc, read from the config so new fields are covered. */
export function mediaReferences(collections: CollectionLike[]): MediaReference[] {
  const found: MediaReference[] = []
  const walk = (slug: string, fields: FieldLike[], prefix: string) => {
    for (const f of fields) {
      const path = f.name ? prefix + f.name : prefix
      const targets = Array.isArray(f.relationTo) ? f.relationTo : [f.relationTo]
      if (f.type === 'upload' && f.name && targets.includes('media')) found.push({ collection: slug, path })
      // rows, collapsibles and unnamed tabs don't add a path segment; groups, arrays and named tabs do
      if (f.fields) walk(slug, f.fields, f.name ? `${path}.` : prefix)
      if (f.tabs) walk(slug, f.tabs, prefix)
      for (const b of f.blocks ?? []) walk(slug, b.fields, `${path}.`)
    }
  }
  for (const c of collections) walk(c.slug, c.fields, '')
  return found
}

/** True if any document (dish, category, restaurant…) still uses the Media doc. */
export async function isMediaReferenced(
  payload: Pick<Payload, 'count'> & { config: { collections: CollectionLike[] } },
  mediaId: number,
): Promise<boolean> {
  for (const ref of mediaReferences(payload.config.collections)) {
    const where: Where = { [ref.path]: { in: [mediaId] } }
    const { totalDocs } = await payload.count({ collection: ref.collection as never, where, overrideAccess: true })
    if (totalDocs > 0) return true
  }
  return false
}

/** Deletes a replaced Media doc (and so its UploadThing file) unless something else still uses it. */
export async function deleteMediaIfUnused(payload: Payload, mediaId: number | null | undefined): Promise<void> {
  if (mediaId == null) return
  try {
    if (await isMediaReferenced(payload, mediaId)) return
    await payload.delete({ collection: 'media', id: mediaId, overrideAccess: true })
  } catch (e) {
    // the new model is already attached: a leftover file only costs storage
    payload.logger.error({ err: e, mediaId }, 'scan finish: could not delete the replaced media')
  }
}
