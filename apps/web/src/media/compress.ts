import sharp from 'sharp'

/** Longest side of a stored photo, in pixels. Plenty for a phone menu; a phone camera makes 3000 to 4000. */
export const MAX_SIDE = 1600
export const WEBP_QUALITY = 80
export const COMPRESSIBLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** `foto.JPG` -> `foto.webp` */
export const webpName = (name: string) => (name.includes('.') ? name.replace(/\.[^.]+$/, '') : name) + '.webp'

/**
 * Shrinks a photo to MAX_SIDE and re-encodes it as WebP. It also applies the camera's rotation and drops every
 * hidden tag (GPS position, phone model, date), which sharp does not copy unless asked. A PNG that is already
 * smaller than its WebP version (a small logo) is kept as it came.
 */
export async function compressImage(input: Buffer, mimetype: string): Promise<{ data: Buffer; mimetype: string; compressed: boolean }> {
  const data = await sharp(input)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()
  if (mimetype === 'image/png' && data.length >= input.length) return { data: input, mimetype, compressed: false }
  return { data, mimetype: 'image/webp', compressed: true }
}
