import path from 'path'
import { fileURLToPath } from 'url'
import type { CollectionConfig } from 'payload'

import { isPlatformAdmin } from '../access/roles'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** Photos of a dish for photogrammetry. Deleted (with their files) once the scan finishes. */
export const ScanPhotos: CollectionConfig = {
  slug: 'scan-photos',
  labels: { singular: 'Foto para 3D', plural: 'Fotos para 3D' },
  admin: {
    group: 'Menú',
    // staff reach them from the scan; the list is only useful to platform admins
    hidden: ({ user }) => !isPlatformAdmin(user),
  },
  fields: [],
  upload: {
    staticDir: path.resolve(dirname, '../../media/scan-photos'),
    // COLMAP reads JPEG; iPhone browsers convert HEIC to JPEG when uploading
    mimeTypes: ['image/jpeg'],
  },
}
