import path from 'path'
import { fileURLToPath } from 'url'
import type { CollectionConfig } from 'payload'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Archivo', plural: 'Fotos y modelos 3D' },
  admin: {
    group: 'Menú',
    description: 'Fotos de platos (PNG con fondo transparente se ven mejor) y modelos 3D (.glb).',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Descripción',
      admin: { description: 'Qué se ve en la imagen (ayuda a personas con lector de pantalla).' },
    },
  ],
  upload: {
    staticDir: path.resolve(dirname, '../../media'),
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary', 'application/octet-stream'],
    adminThumbnail: 'thumbnail',
    imageSizes: [{ name: 'thumbnail', width: 360, height: 360, fit: 'inside', withoutEnlargement: true }],
  },
}
