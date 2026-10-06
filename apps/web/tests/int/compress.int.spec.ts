import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { compressPlanUploads } from '../../src/hooks/compressUploads'
import { compressImage, MAX_SIDE, webpName } from '../../src/media/compress'
import { limitsFor } from '../../src/plans'

/** A noisy photo-like image, which does not compress for free like a flat colour does. */
const photo = (width: number, height: number, format: 'jpeg' | 'png' = 'jpeg') => {
  // `noise` is real in sharp but missing from its Create type, hence the cast
  const img = sharp({ create: { width, height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } } as never)
  return format === 'jpeg' ? img.jpeg({ quality: 92 }) : img.png()
}

describe('compressImage', () => {
  it('shrinks a phone-sized photo to 1600 px WebP and makes it much smaller', async () => {
    const input = await photo(3000, 2000).toBuffer()
    const out = await compressImage(input, 'image/jpeg')
    const meta = await sharp(out.data).metadata()
    expect(out.compressed).toBe(true)
    expect(out.mimetype).toBe('image/webp')
    expect(meta.format).toBe('webp')
    expect(Math.max(meta.width!, meta.height!)).toBe(MAX_SIDE)
    expect(out.data.length).toBeLessThan(input.length / 2)
  })

  it('does not enlarge a small image', async () => {
    const out = await compressImage(await photo(800, 600).toBuffer(), 'image/jpeg')
    const meta = await sharp(out.data).metadata()
    expect([meta.width, meta.height]).toEqual([800, 600])
  })

  it('applies the camera rotation and drops the hidden tags', async () => {
    // a 400x200 image the camera marked «rotate 90°»: it must come out upright (200x400) with no EXIF
    const input = await photo(400, 200).withExif({ IFD0: { Copyright: 'secret-owner' } }).withMetadata({ orientation: 6 }).toBuffer()
    expect((await sharp(input).metadata()).exif).toBeDefined()
    const out = await compressImage(input, 'image/jpeg')
    const meta = await sharp(out.data).metadata()
    expect([meta.width, meta.height]).toEqual([200, 400])
    expect(meta.exif).toBeUndefined()
    expect(out.data.toString('latin1')).not.toContain('secret-owner')
  })

  it('keeps a PNG that is already smaller than its WebP version, otherwise converts it', async () => {
    const input = await photo(300, 300, 'png').toBuffer()
    const out = await compressImage(input, 'image/png')
    expect(out.compressed ? out.mimetype === 'image/webp' && out.data.length < input.length : out.data.equals(input)).toBe(true)
  })
})

describe('webpName', () => {
  it('swaps the extension', () => {
    expect(webpName('IMG_2041.JPG')).toBe('IMG_2041.webp')
    expect(webpName('foto.final.png')).toBe('foto.final.webp')
    expect(webpName('sinextension')).toBe('sinextension.webp')
  })
})

describe('compressPlanUploads hook', () => {
  const restaurant = (plan: string | null) => ({ id: 1, plan })
  const staff = (plan: string | null) => ({ role: 'staff', tenants: [{ tenant: restaurant(plan) }] })
  const run = async (user: unknown, file: unknown) => {
    const req = { user, file } as never
    await compressPlanUploads({ args: {}, operation: 'create', req, collection: {} } as never)
    return (req as { file: { name: string; mimetype: string; size: number; data: Buffer } }).file
  }
  const upload = async () => {
    const data = await photo(3000, 2000).toBuffer()
    return { name: 'IMG_1.jpg', mimetype: 'image/jpeg', size: data.length, data }
  }

  it('shrinks what a Gratis restaurant uploads', async () => {
    const file = await upload()
    const out = await run(staff('free'), { ...file })
    expect(out.mimetype).toBe('image/webp')
    expect(out.name).toBe('IMG_1.webp')
    expect(out.size).toBe(out.data.length)
    expect(out.size).toBeLessThan(file.size / 2)
  })

  it('leaves paid plans, pilots without plan and platform admins alone', async () => {
    for (const user of [staff('menu'), staff('salon'), staff(null), { role: 'admin' }]) {
      const file = await upload()
      const out = await run(user, { ...file })
      expect(out.mimetype).toBe('image/jpeg')
      expect(out.data.equals(file.data)).toBe(true)
    }
  })

  it('leaves 3D models and other files alone', async () => {
    const out = await run(staff('free'), { name: 'plato.glb', mimetype: 'model/gltf-binary', size: 4, data: Buffer.from('glTF') })
    expect(out.mimetype).toBe('model/gltf-binary')
    expect(out.name).toBe('plato.glb')
  })

  it('only the Gratis plan compresses', () => {
    expect(limitsFor('free').compressUploads).toBe(true)
    for (const p of ['menu', 'pedidos', 'salon', null]) expect(limitsFor(p).compressUploads).toBe(false)
  })
})
