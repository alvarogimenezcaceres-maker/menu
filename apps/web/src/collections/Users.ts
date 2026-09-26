import type { CollectionConfig } from 'payload'

import { isPlatformAdmin } from '../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Usuario', plural: 'Usuarios' },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'role'],
    group: 'Configuración',
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
  },
  fields: [
    { name: 'name', type: 'text', label: 'Nombre' },
    {
      name: 'role',
      type: 'select',
      label: 'Rol',
      required: true,
      defaultValue: 'staff',
      options: [
        { label: 'Administrador de la plataforma', value: 'admin' },
        { label: 'Personal del restaurante', value: 'staff' },
      ],
      access: {
        // only platform admins can promote someone
        create: ({ req }) => isPlatformAdmin(req.user),
        update: ({ req }) => isPlatformAdmin(req.user),
      },
      saveToJWT: true,
    },
  ],
}
