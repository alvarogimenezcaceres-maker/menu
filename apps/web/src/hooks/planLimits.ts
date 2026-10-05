import { APIError, type CollectionBeforeChangeHook, type PayloadRequest } from 'payload'

import { isPlatformAdmin } from '../access/roles'
import { dishCapMessage, limitsFor, scan3dMessage, type PlanLimits } from '../plans'

/** Restaurant staff (not a platform admin) are the ones the plan limits apply to. */
export const isStaffUser = (user: unknown): boolean => Boolean(user) && !isPlatformAdmin(user)

const idOf = (v: unknown): number | string | null => {
  if (v && typeof v === 'object' && 'id' in v) return (v as { id: number | string }).id
  return typeof v === 'number' || typeof v === 'string' ? v : null
}

/** The limits of a restaurant's plan, read with full access (staff cannot read other restaurants anyway). */
export async function restaurantLimits(req: PayloadRequest, restaurantId: number | string): Promise<PlanLimits> {
  const r = await req.payload.findByID({ collection: 'restaurants', id: restaurantId, depth: 0, overrideAccess: true, req })
  return limitsFor((r as { plan?: string | null }).plan)
}

/** A staff user on the Gratis plan cannot create more dishes than the plan allows. */
export const enforceDishCap: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || !isStaffUser(req.user)) return data
  const tenantId = idOf(data?.tenant)
  if (tenantId == null) return data
  const limits = await restaurantLimits(req, tenantId)
  if (limits.maxDishes == null) return data
  const { totalDocs } = await req.payload.count({ collection: 'dishes', where: { tenant: { equals: tenantId } }, overrideAccess: true, req })
  if (totalDocs >= limits.maxDishes) throw new APIError(dishCapMessage(limits.maxDishes), 400, undefined, true)
  return data
}

/** 3D scans belong to the paid plans. */
export async function assertScan3dAllowed(req: PayloadRequest, restaurantId: number | string | null) {
  if (!isStaffUser(req.user) || restaurantId == null) return
  const limits = await restaurantLimits(req, restaurantId)
  if (!limits.scan3d) throw new APIError(scan3dMessage, 403, undefined, true)
}
