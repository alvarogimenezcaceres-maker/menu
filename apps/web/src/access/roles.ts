import type { Access } from 'payload'

import type { User } from '../payload-types'

export const isPlatformAdmin = (user: unknown): boolean => (user as User | null)?.role === 'admin'

export const platformAdminOnly: Access = ({ req }) => isPlatformAdmin(req.user)

export const loggedIn: Access = ({ req }) => Boolean(req.user)

/** Ids of the restaurants the user works for (from the multi-tenant `tenants` array). */
export const userRestaurantIds = (user: unknown): (number | string)[] =>
  ((user as User | null)?.tenants ?? [])
    .map((t) => (typeof t.tenant === 'object' && t.tenant ? t.tenant.id : t.tenant))
    .filter((id): id is number => id != null)
