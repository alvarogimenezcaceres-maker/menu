/**
 * Plans and what each one allows in the panel. The «Gratis» plan (decided 2026-10-04, product cap cut to 11
 * on 2026-10-05) lets a restaurant manage its own menu with limits; the paid plans have none.
 * A restaurant without a plan (the pilots, created before plans existed) is treated as unlimited.
 */
export const PLAN_OPTIONS = [
  { label: 'Gratis', value: 'free' },
  { label: 'Menú', value: 'menu' },
  { label: 'Pedidos', value: 'pedidos' },
  { label: 'Salón', value: 'salon' },
] as const

export type PlanId = (typeof PLAN_OPTIONS)[number]['value']

export const FREE_MAX_DISHES = 11
export const FREE_MIN_TO_PUBLISH = 8
export const FREE_PUBLISHES_PER_DAY = 5

export interface PlanLimits {
  /** Most dishes the restaurant may have; null = no cap. */
  maxDishes: number | null
  /** Fewest dishes with a price needed before the menu can be published. */
  minToPublish: number
  /** «Generar 3D desde fotos». */
  scan3d: boolean
  /** Publications per day; null = no cap. */
  publishesPerDay: number | null
  /** The first publication waits for a platform admin to approve it. */
  needsApproval: boolean
  /** Checkout settings (zones, fees, payment methods, hours) stay out of the published menu. */
  basicOrdering: boolean
}

const UNLIMITED: PlanLimits = {
  maxDishes: null,
  minToPublish: 0,
  scan3d: true,
  publishesPerDay: null,
  needsApproval: false,
  basicOrdering: false,
}

const FREE: PlanLimits = {
  maxDishes: FREE_MAX_DISHES,
  minToPublish: FREE_MIN_TO_PUBLISH,
  scan3d: false,
  publishesPerDay: FREE_PUBLISHES_PER_DAY,
  needsApproval: true,
  basicOrdering: true,
}

export const limitsFor = (plan: string | null | undefined): PlanLimits => (plan === 'free' ? FREE : UNLIMITED)

export const dishCapMessage = (max: number) =>
  `Tu plan Gratis permite hasta ${max} productos. Borrá uno o pasate a un plan pago para cargar todo tu menú.`

export const scan3dMessage = 'El 3D es parte de los planes pagos. Escribinos si querés sumarlo.'

export const approvalMessage =
  'Tu menú está en revisión. Cuando lo aprobemos vas a poder publicarlo; te avisamos por WhatsApp.'

export const minToPublishMessage = (min: number, have: number) =>
  `Para publicar necesitás al menos ${min} productos con precio y visibles (ahora tenés ${have}).`

export const maxToPublishMessage = (max: number, have: number) =>
  `El plan Gratis publica hasta ${max} productos (ahora hay ${have}). Ocultá o borrá ${have - max}.`

export const dailyPublishMessage = (max: number) =>
  `Llegaste al máximo de ${max} publicaciones por hoy. Mañana podés seguir.`

/** Day key in Paraguay time (UTC-3 all year), used by the daily publication counter. */
export const paraguayDay = (now: Date = new Date()) => new Date(now.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10)

/** Publications already done today, given what the restaurant stored. */
export const publishesToday = (state: { publishDay?: string | null; publishCount?: number | null }, today: string) =>
  state.publishDay === today ? (state.publishCount ?? 0) : 0

/** The restaurant's check before a publication: null when it may go ahead, otherwise the message to show. */
export function publishBlock(args: {
  limits: PlanLimits
  isAdmin: boolean
  approved: boolean
  published: number
  today: number
}): { status: number; message: string } | null {
  const { limits, isAdmin, approved, published, today } = args
  // the actionable messages first: what the local can fix itself comes before waiting for approval
  if (published < limits.minToPublish) return { status: 400, message: minToPublishMessage(limits.minToPublish, published) }
  if (limits.maxDishes != null && published > limits.maxDishes) return { status: 400, message: maxToPublishMessage(limits.maxDishes, published) }
  if (limits.needsApproval && !isAdmin && !approved) return { status: 403, message: approvalMessage }
  if (limits.publishesPerDay != null && !isAdmin && today >= limits.publishesPerDay)
    return { status: 429, message: dailyPublishMessage(limits.publishesPerDay) }
  return null
}
