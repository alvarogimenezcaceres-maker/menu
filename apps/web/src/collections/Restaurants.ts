import type { CollectionConfig } from 'payload'

import { isPlatformAdmin, platformAdminOnly, userRestaurantIds } from '../access/roles'
import { slugField } from '../fields/slug'
import { publishEndpoint } from '../publish/endpoint'

const validateTime = (value: unknown) =>
  typeof value === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(value.trim()) ? true : 'Usá el formato 18:00.'

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
    {
      type: 'collapsible',
      label: 'Pedidos por WhatsApp',
      admin: { initCollapsed: true, description: 'Lo que el cliente completa antes de mandar el pedido. Vacío = valores comunes.' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'orderTypes',
              type: 'select',
              hasMany: true,
              label: 'Tipos de pedido',
              defaultValue: ['delivery', 'pickup'],
              options: [
                { label: 'Delivery', value: 'delivery' },
                { label: 'Retiro en el local', value: 'pickup' },
              ],
              admin: { width: '50%' },
            },
            {
              name: 'paymentMethods',
              type: 'select',
              hasMany: true,
              label: 'Formas de pago',
              defaultValue: ['efectivo', 'transferencia'],
              options: [
                { label: 'Efectivo', value: 'efectivo' },
                { label: 'Transferencia', value: 'transferencia' },
                { label: 'QR', value: 'qr' },
                { label: 'Tarjeta (POS al recibir)', value: 'tarjeta' },
              ],
              admin: { width: '50%' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'deliveryFee',
              type: 'number',
              label: 'Costo de envío',
              min: 0,
              admin: { width: '50%', description: 'En guaraníes. Vacío = «a confirmar». Si cargás zonas, se usa el de la zona.' },
            },
            {
              name: 'minOrder',
              type: 'number',
              label: 'Pedido mínimo para delivery',
              min: 0,
              admin: { width: '50%', description: 'En guaraníes, sin contar el envío. Vacío = sin mínimo.' },
            },
          ],
        },
        {
          name: 'deliveryZones',
          type: 'array',
          label: 'Zonas de envío',
          labels: { singular: 'Zona', plural: 'Zonas' },
          admin: { initCollapsed: true, description: 'Opcional. Ej.: Centro ₲ 10.000, Lambaré ₲ 15.000.' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'name', type: 'text', label: 'Zona', required: true, admin: { width: '60%' } },
                { name: 'fee', type: 'number', label: 'Envío', min: 0, required: true, admin: { width: '40%' } },
              ],
            },
          ],
        },
        {
          name: 'transferInfo',
          type: 'textarea',
          label: 'Datos para transferir',
          admin: { description: 'Se muestran si el cliente elige transferencia o QR. Ej.: Alias 0981 123 456 · Banco… · a nombre de…' },
        },
        {
          name: 'hours',
          type: 'array',
          label: 'Horarios',
          labels: { singular: 'Horario', plural: 'Horarios' },
          admin: {
            initCollapsed: true,
            description: 'Hora de Paraguay. Si cierra después de medianoche, poné la hora de cierre igual (ej.: 18:00 a 02:00). Vacío = siempre abierto.',
          },
          fields: [
            {
              name: 'days',
              type: 'select',
              hasMany: true,
              label: 'Días',
              required: true,
              options: [
                { label: 'Lunes', value: 'mon' },
                { label: 'Martes', value: 'tue' },
                { label: 'Miércoles', value: 'wed' },
                { label: 'Jueves', value: 'thu' },
                { label: 'Viernes', value: 'fri' },
                { label: 'Sábado', value: 'sat' },
                { label: 'Domingo', value: 'sun' },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'open', type: 'text', label: 'Abre', required: true, validate: validateTime, admin: { width: '50%', placeholder: '18:00' } },
                { name: 'close', type: 'text', label: 'Cierra', required: true, validate: validateTime, admin: { width: '50%', placeholder: '23:30' } },
              ],
            },
          ],
        },
      ],
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
