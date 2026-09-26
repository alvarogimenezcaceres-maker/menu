import { describe, expect, it } from 'vitest'

import { isMediaReferenced, mediaReferences } from '../../src/scans/media-cleanup'

const collections = [
  {
    slug: 'dishes',
    fields: [
      { type: 'text', name: 'name' },
      {
        type: 'row',
        fields: [
          { type: 'upload', name: 'photo', relationTo: 'media' },
          { type: 'upload', name: 'model', relationTo: 'media' },
        ],
      },
    ],
  },
  { slug: 'categories', fields: [{ type: 'upload', name: 'cover', relationTo: 'media' }] },
  {
    slug: 'restaurants',
    fields: [
      { type: 'tabs', tabs: [{ fields: [{ type: 'upload', name: 'logo', relationTo: 'media' }] }] },
      { type: 'group', name: 'seo', fields: [{ type: 'upload', name: 'image', relationTo: ['media', 'other'] }] },
    ],
  },
  { slug: 'scans', fields: [{ type: 'upload', name: 'photos', relationTo: 'scan-photos' }] },
]

/** Fake payload.count: `docs` lists which [collection, path, mediaId] exist. */
const fakePayload = (docs: [string, string, number][]) => ({
  config: { collections },
  count: async ({ collection, where }: { collection: string; where: Record<string, { in: number[] }> }) => {
    const [path, cond] = Object.entries(where)[0]
    const totalDocs = docs.filter(([c, p, id]) => c === collection && p === path && cond.in.includes(id)).length
    return { totalDocs }
  },
})

describe('media references', () => {
  it('finds every upload field pointing at media, through rows, tabs and groups', () => {
    expect(mediaReferences(collections)).toEqual([
      { collection: 'dishes', path: 'photo' },
      { collection: 'dishes', path: 'model' },
      { collection: 'categories', path: 'cover' },
      { collection: 'restaurants', path: 'logo' },
      { collection: 'restaurants', path: 'seo.image' },
    ])
  })

  it('reports a model still used by another dish, a category or a restaurant', async () => {
    expect(await isMediaReferenced(fakePayload([['dishes', 'model', 5]]) as never, 5)).toBe(true)
    expect(await isMediaReferenced(fakePayload([['categories', 'cover', 5]]) as never, 5)).toBe(true)
    expect(await isMediaReferenced(fakePayload([['restaurants', 'seo.image', 5]]) as never, 5)).toBe(true)
  })

  it('reports an unused model as free to delete', async () => {
    expect(await isMediaReferenced(fakePayload([]) as never, 5)).toBe(false)
    expect(await isMediaReferenced(fakePayload([['dishes', 'model', 6]]) as never, 5)).toBe(false)
  })
})
