import { postgresAdapter } from '@payloadcms/db-postgres'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { uploadthingStorage } from '@payloadcms/storage-uploadthing'
import { es } from '@payloadcms/translations/languages/es'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { isPlatformAdmin } from './access/roles'
import { Categories } from './collections/Categories'
import { Dishes } from './collections/Dishes'
import { Media } from './collections/Media'
import { Restaurants } from './collections/Restaurants'
import { ScanPhotos } from './collections/ScanPhotos'
import { Scans } from './collections/Scans'
import { Users } from './collections/Users'
import { migrations } from './migrations'
import type { Config } from './payload-types'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: { titleSuffix: ' · Menú 3D' },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  i18n: {
    supportedLanguages: { es },
    fallbackLanguage: 'es',
  },
  collections: [Restaurants, Categories, Dishes, Media, Scans, ScanPhotos, Users],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    // production (Render) applies pending schema migrations on start; local dev keeps pushing the schema
    prodMigrations: migrations,
  }),
  sharp,
  plugins: [
    // In the cloud, photos and 3D models live in UploadThing; without a token they stay in apps/web/media
    ...(process.env.UPLOADTHING_TOKEN
      ? [
          uploadthingStorage({
            // Photos and models are public: hand out direct utfs.io URLs instead of proxying through
            // the panel (the proxy asks UploadThing for signed URLs, which fails for public-read files).
            collections: { media: { disablePayloadAccessControl: true }, 'scan-photos': { disablePayloadAccessControl: true } },
            options: { token: process.env.UPLOADTHING_TOKEN, acl: 'public-read' },
          }),
        ]
      : []),
    multiTenantPlugin<Config>({
      tenantsSlug: 'restaurants',
      collections: {
        categories: {},
        dishes: {},
        media: {},
        scans: {},
        'scan-photos': {},
      },
      tenantField: { name: 'tenant', label: 'Restaurante' },
      tenantsArrayField: { includeDefaultField: true },
      userHasAccessToAllTenants: (user) => isPlatformAdmin(user),
      i18n: {
        translations: {
          es: {
            'nav-tenantSelector-label': 'Restaurante',
            'assign-tenant-button-label': 'Asignar restaurante',
            'field-assignedTenant-label': 'Restaurante asignado',
          },
        },
      },
    }),
  ],
})
