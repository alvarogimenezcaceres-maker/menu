import type { CollectionConfig } from 'payload'

import { isPlatformAdmin, platformAdminOnly, userRestaurantIds } from '../access/roles'
import { slugField } from '../fields/slug'
import { publishEndpoint } from '../publish/endpoint'

/** Each restaurant is a tenant: its staff only see its own categories, dishes and files. */
export const Restaurants: CollectionConfig = {
  slug: 'restaurants',
  labels: { singular: 'Restaurante', plural: 'Restaurantes' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'lastPublishedAt'],
    group: 'Configuración',
  },
  access: {
    create: platformAdminOnly,
    delete: platformAdminOnly,
    read: ({ req }) => (isPlatformAdmin(req.user) ? true : { id: { in: userRestaurantIds(req.user) } }),
    update: ({ req }) => (isPlatformAdmin(req.user) ? true : { id: { in: userRestaurantIds(req.user) } }),
  },
  endpoints: [publishEndpoint],
  fields: [
    {
      type: 'ui',
      name: 'publish',
      admin: { components: { Field: '/components/PublishButton#PublishButton' } },
    },
    { name: 'name', type: 'text', label: 'Nombre', required: true },
    slugField({ unique: true }),
    { name: 'tagline', type: 'text', label: 'Frase corta', admin: { description: 'Aparece debajo del logo.' } },
    { name: 'description', type: 'textarea', label: 'Descripción (para Google y redes)' },
    {
      type: 'row',
      fields: [
        { name: 'logo', type: 'upload', relationTo: 'media', label: 'Logo (fondo oscuro)' },
        { name: 'hero', type: 'upload', relationTo: 'media', label: 'Plato de portada' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'tables',
          type: 'number',
          label: 'Cantidad de mesas',
          min: 0,
          max: 200,
          defaultValue: 10,
          admin: { description: 'Se genera un QR por mesa.' },
        },
        {
          name: 'currency',
          type: 'select',
          label: 'Moneda',
          defaultValue: 'PYG',
          options: [
            { label: 'Guaraníes (₲)', value: 'PYG' },
            { label: 'Dólares (US$)', value: 'USD' },
          ],
        },
      ],
    },
    {
      name: 'whatsapp',
      type: 'text',
      label: 'WhatsApp para pedidos',
      admin: { description: 'Ej.: 0976 145 539. Si está vacío, el menú no muestra el botón «Enviar pedido por WhatsApp».' },
    },
    { name: 'cuisine', type: 'text', hasMany: true, label: 'Tipo de cocina', admin: { description: 'Ej.: Pizza, Parrilla. Ayuda en Google.' } },
    {
      name: 'theme',
      type: 'group',
      label: 'Colores de la marca',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'primary', type: 'text', label: 'Principal', defaultValue: '#ED9D15' },
            { name: 'primaryLight', type: 'text', label: 'Principal claro', defaultValue: '#FFB943' },
            { name: 'background', type: 'text', label: 'Fondo', defaultValue: '#181818' },
            { name: 'accentWine', type: 'text', label: 'Sección vinos', defaultValue: '#8F1B51' },
          ],
        },
      ],
    },
    {
      name: 'lastPublishedAt',
      type: 'date',
      label: 'Última publicación',
      admin: { readOnly: true, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
      access: { update: () => false },
    },
  ],
}
