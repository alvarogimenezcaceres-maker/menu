import type { CollectionConfig } from 'payload'

import { slugField } from '../fields/slug'

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: 'Categoría', plural: 'Categorías' },
  orderable: true,
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug'],
    group: 'Menú',
    description: 'Arrastrá las filas para cambiar el orden en el menú.',
  },
  fields: [
    { name: 'name', type: 'text', label: 'Nombre', required: true },
    slugField(),
    { name: 'description', type: 'textarea', label: 'Nota de la sección', admin: { description: 'Ej.: "Guarniciones incluidas: …"' } },
    { name: 'cover', type: 'upload', relationTo: 'media', label: 'Foto de la sección' },
  ],
}
