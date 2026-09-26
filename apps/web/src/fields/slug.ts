import type { TextField } from 'payload'

export const slugify = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)

/** URL slug filled from `name` when left empty. */
export const slugField = (overrides: { unique?: boolean } = {}): TextField => ({
  name: 'slug',
  type: 'text',
  label: 'Identificador en la URL',
  required: true,
  index: true,
  admin: {
    position: 'sidebar',
    description: 'Se completa solo a partir del nombre. Solo minúsculas, números y guiones.',
  },
  hooks: {
    beforeValidate: [({ value, data }) => slugify(String(value || data?.name || ''))],
  },
  validate: (value: unknown) =>
    typeof value === 'string' && /^[a-z0-9](-?[a-z0-9])*$/.test(value)
      ? true
      : 'Usá solo minúsculas, números y guiones (por ejemplo: pizza-margarita).',
  ...overrides,
})
