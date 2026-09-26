import type { CollectionConfig } from 'payload'

import { slugField } from '../fields/slug'

export const TAG_OPTIONS = [
  { label: 'Destacado', value: 'destacado' },
  { label: 'Para compartir', value: 'para compartir' },
  { label: 'Picante', value: 'picante' },
  { label: 'Sin gluten', value: 'sin gluten' },
  { label: 'Sin alcohol', value: 'sin alcohol' },
  { label: 'Vegetariano', value: 'vegetariano' },
  { label: 'De la casa', value: 'de la casa' },
  { label: 'Agregado / extra', value: 'extra' },
]

export const Dishes: CollectionConfig = {
  slug: 'dishes',
  labels: { singular: 'Plato', plural: 'Platos y bebidas' },
  orderable: true,
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'category', 'price', 'visible', 'soldOut'],
    group: 'Menú',
    listSearchableFields: ['name', 'description'],
    description: 'Arrastrá las filas para cambiar el orden dentro de cada categoría.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', label: 'Nombre', required: true, admin: { width: '60%' } },
        {
          name: 'price',
          type: 'number',
          label: 'Precio',
          min: 0,
          admin: { width: '40%', description: 'En guaraníes, sin puntos. Vacío = no se publica.' },
        },
      ],
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      label: 'Categoría',
      required: true,
      filterOptions: ({ data }) => (data?.tenant ? { tenant: { equals: data.tenant } } : true),
    },
    { name: 'description', type: 'textarea', label: 'Descripción' },
    { name: 'ingredients', type: 'text', hasMany: true, label: 'Ingredientes', admin: { description: 'Escribí cada ingrediente y Enter.' } },
    {
      name: 'tags',
      type: 'text',
      hasMany: true,
      label: 'Etiquetas',
      admin: {
        description: `Con significado en el menú: ${TAG_OPTIONS.map((t) => t.value).join(', ')}. En vinos, cualquier dato: tinto, Rioja, Malbec…`,
      },
    },
    {
      name: 'options',
      type: 'array',
      label: 'Opciones para elegir',
      labels: { singular: 'Grupo de opciones', plural: 'Grupos de opciones' },
      admin: { description: 'Ej.: Sabor → Durazno, Frutilla, Limón.', initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'group', type: 'text', label: 'Grupo', required: true },
            { name: 'multiple', type: 'checkbox', label: 'Se pueden elegir varias', defaultValue: false },
          ],
        },
        { name: 'choices', type: 'text', hasMany: true, label: 'Opciones', required: true },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'photo', type: 'upload', relationTo: 'media', label: 'Foto' },
        {
          name: 'model',
          type: 'upload',
          relationTo: 'media',
          label: 'Modelo 3D (.glb)',
          filterOptions: { mimeType: { in: ['model/gltf-binary', 'application/octet-stream'] } },
        },
      ],
    },
    {
      type: 'ui',
      name: 'scan3d',
      admin: { components: { Field: '/components/DishScanBox#DishScanBox' } },
    },
    { name: 'modelNote', type: 'text', label: 'Nota del modelo 3D', admin: { description: 'Ej.: "Modelo de demostración".' } },
    slugField(),
    {
      name: 'visible',
      type: 'checkbox',
      label: 'Mostrar en el menú',
      defaultValue: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'soldOut',
      type: 'checkbox',
      label: 'Agotado hoy',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'Se ve en el menú, marcado como agotado.' },
    },
    {
      name: 'internalNote',
      type: 'textarea',
      label: 'Nota interna',
      admin: { position: 'sidebar', description: 'No se publica.' },
    },
  ],
}
