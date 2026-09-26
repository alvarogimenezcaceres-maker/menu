import { APIError, type CollectionConfig, type FieldAccess } from 'payload'

import { generateEndpoint, MAX_PHOTOS, MIN_PHOTOS, workerFinishEndpoint, workerStartEndpoint } from '../scans/endpoints'

/** Only the panel itself (local API with overrideAccess) writes the job state. */
const systemOnly: FieldAccess = () => false

export const SCAN_STATUS = [
  { label: 'En cola', value: 'queued' },
  { label: 'Procesando', value: 'processing' },
  { label: 'Listo', value: 'done' },
  { label: 'Falló', value: 'failed' },
]

/** A «Generar 3D desde fotos» job: photos of a dish in, a GLB on the dish out (GitHub Actions). */
export const Scans: CollectionConfig = {
  slug: 'scans',
  labels: { singular: 'Escaneo 3D', plural: 'Escaneos 3D' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'createdAt'],
    group: 'Menú',
    description: 'Fotos de un plato → modelo 3D. Se empieza desde el plato: «Generar 3D desde fotos».',
  },
  // worker routes first: '/:id/generate' must not swallow '/worker/…'
  endpoints: [workerStartEndpoint, workerFinishEndpoint, generateEndpoint],
  hooks: {
    beforeValidate: [
      async ({ data, originalDoc, req, operation }) => {
        if (!data) return data
        if (operation === 'create' && data.dish) {
          // the dish must be one the user can see: its restaurant becomes the scan's restaurant
          const dish = await req.payload
            .findByID({ collection: 'dishes', id: data.dish, user: req.user, overrideAccess: !req.user, depth: 0, req })
            .catch(() => null)
          if (!dish) throw new APIError('No tenés acceso a ese plato.', 403)
          data.tenant = typeof dish.tenant === 'object' && dish.tenant ? dish.tenant.id : dish.tenant
          data.title = dish.name
        }
        if (req.user && (originalDoc?.status === 'queued' || originalDoc?.status === 'processing')) {
          throw new APIError('Este escaneo se está procesando: esperá a que termine.', 409)
        }
        return data
      },
    ],
  },
  fields: [
    {
      type: 'ui',
      name: 'generate',
      admin: { components: { Field: '/components/ScanGenerateBox#ScanGenerateBox' } },
    },
    { name: 'title', type: 'text', label: 'Plato', admin: { hidden: true } },
    {
      name: 'dish',
      type: 'relationship',
      relationTo: 'dishes',
      label: 'Plato',
      // not `required`: a NOT NULL column would block deleting a dish that has old scans
      validate: (value: unknown) => (value ? true : 'Elegí el plato.'),
      access: { update: systemOnly },
      filterOptions: ({ data }) => (data?.tenant ? { tenant: { equals: data.tenant } } : true),
    },
    {
      name: 'diameterCm',
      type: 'number',
      label: 'Diámetro real del plato (cm)',
      min: 3,
      max: 80,
      admin: { description: 'Medilo con una regla. En realidad aumentada el plato aparece con este tamaño.' },
    },
    {
      name: 'photos',
      type: 'upload',
      relationTo: 'scan-photos',
      hasMany: true,
      label: `Fotos (${MIN_PHOTOS} a ${MAX_PHOTOS}; lo ideal son 40 a 80)`,
      admin: {
        description:
          'Plato sobre una mesa con textura (mantel, madera), buena luz y sin moverlo. Tres vueltas: baja, a media altura y desde arriba. Que cada foto se superponga con la anterior. Se borran al terminar.',
      },
    },
    {
      name: 'status',
      type: 'select',
      label: 'Estado',
      options: SCAN_STATUS,
      access: { create: systemOnly, update: systemOnly },
      admin: { position: 'sidebar', readOnly: true, description: 'Vacío = todavía no se generó.' },
    },
    { name: 'runUrl', type: 'text', label: 'Proceso en GitHub', access: { create: systemOnly, update: systemOnly }, admin: { position: 'sidebar', readOnly: true } },
    { name: 'result', type: 'text', label: 'Resultado', access: { create: systemOnly, update: systemOnly }, admin: { position: 'sidebar', readOnly: true } },
    { name: 'error', type: 'text', label: 'Error', access: { create: systemOnly, update: systemOnly }, admin: { position: 'sidebar', readOnly: true } },
    { name: 'requestedAt', type: 'date', label: 'Pedido', access: { create: systemOnly, update: systemOnly }, admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'finishedAt', type: 'date', label: 'Terminado', access: { create: systemOnly, update: systemOnly }, admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
  ],
}
