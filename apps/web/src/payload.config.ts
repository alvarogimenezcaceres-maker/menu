import { postgresAdapter } from '@payloadcms/db-postgres'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
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
import { Users } from './collections/Users'
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
  collections: [Restaurants, Categories, Dishes, Media, Users],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [
    multiTenantPlugin<Config>({
      tenantsSlug: 'restaurants',
      collections: {
        categories: {},
        dishes: {},
        media: {},
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
