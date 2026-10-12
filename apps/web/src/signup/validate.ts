import { slugify } from '../fields/slug'

/** Terms version stored with each self-signed restaurant (same family as the WhatsApp acceptance «G-1»). */
export const SIGNUP_TERMS_VERSION = 'G-1'

/** Slugs the public site already uses for its own routes. */
const RESERVED_SLUGS = new Set(['admin', 'api', 'qr', 'caja', 'e', 'registro', 'assets', 'mesa', 'privacidad'])

export interface SignupInput {
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
  restaurantName: string
}

export type SignupResult = { ok: true; data: SignupInput } | { ok: false; errors: Record<string, string> }

const str = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')

/** Paraguayan number to «+595981123456»; null when it cannot be one. Accepts 0981 123 456, +595 981 123456, 595981123456. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (!/^\d+$/.test(digits)) return null
  const national = digits.startsWith('595') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits
  return /^\d{8,9}$/.test(national) ? `+595${national}` : null
}

export function validateSignup(body: unknown): SignupResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const errors: Record<string, string> = {}

  const firstName = str(b.firstName)
  const lastName = str(b.lastName)
  const email = str(b.email).toLowerCase()
  const restaurantName = str(b.restaurantName)
  const password = typeof b.password === 'string' ? b.password : ''
  const phone = normalizePhone(str(b.phone))

  if (firstName.length < 2 || firstName.length > 60) errors.firstName = 'Escribí tu nombre.'
  if (lastName.length < 2 || lastName.length > 60) errors.lastName = 'Escribí tu apellido.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) errors.email = 'Escribí un correo válido.'
  if (!phone) errors.phone = 'Escribí tu celular, por ejemplo 0981 123 456.'
  if (restaurantName.length < 2 || restaurantName.length > 80) errors.restaurantName = 'Escribí el nombre de tu local.'
  else if (!slugify(restaurantName)) errors.restaurantName = 'Usá letras o números en el nombre del local.'
  if (password.length < 10) errors.password = 'La contraseña tiene que tener al menos 10 caracteres.'
  else if (password.length > 128) errors.password = 'La contraseña es demasiado larga.'
  if (b.terms !== true) errors.terms = 'Tenés que aceptar los términos y el aviso de privacidad.'

  if (Object.keys(errors).length || !phone) return { ok: false, errors }
  return { ok: true, data: { firstName, lastName, email, phone, password, restaurantName } }
}

/** First free slug for a restaurant name: «pizza-sol», then «pizza-sol-2», … */
export function pickSlug(name: string, taken: (slug: string) => boolean): string {
  const base = slugify(name) || 'local'
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`
    if (!RESERVED_SLUGS.has(candidate) && !taken(candidate)) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

/** Fixed-window limiter kept in memory: enough for one Render instance, resets on restart. */
export function makeLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>()
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    if (recent.length >= max) {
      hits.set(key, recent)
      return false
    }
    recent.push(now)
    hits.set(key, recent)
    return true
  }
}
