import type { Endpoint } from 'payload'

import { makeLimiter, pickSlug, SIGNUP_TERMS_VERSION, validateSignup } from './validate'

// per address and overall, so a script cannot fill the database with empty locales
const perIp = makeLimiter(5, 60 * 60 * 1000)
const overall = makeLimiter(100, 24 * 60 * 60 * 1000)

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * Public signup (POST /api/registro): creates a Gratis restaurant and its owner account.
 * The new local cannot publish until a platform admin approves it, so an open signup cannot put anything live.
 */
export const signupEndpoint: Endpoint = {
  path: '/registro',
  method: 'post',
  handler: async (req) => {
    let body: unknown
    try {
      body = await req.json?.()
    } catch {
      return json({ message: 'No pudimos leer el formulario.' }, 400)
    }
    // honeypot: real people never see this field
    if (body && typeof body === 'object' && (body as { website?: unknown }).website) return json({ ok: true })

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    if (!perIp(ip) || !overall('all')) return json({ message: 'Hubo muchos intentos. Probá de nuevo en un rato o escribinos por WhatsApp.' }, 429)

    const parsed = validateSignup(body)
    if (!parsed.ok) return json({ message: 'Revisá los datos marcados.', errors: parsed.errors }, 400)
    const { firstName, lastName, email, phone, password, restaurantName, codigo } = parsed.data
    const { payload } = req

    const exists = await payload.count({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true })
    if (exists.totalDocs > 0)
      return json({ message: 'Ya hay una cuenta con ese correo. Entrá con tu contraseña.', errors: { email: 'Ya hay una cuenta con este correo.' } }, 409)

    // activation link of an imported restaurant (see import-seed): the user becomes its admin; the code works once
    if (codigo) {
      const claimed = await payload.update({ collection: 'restaurants', where: { claimCode: { equals: codigo } }, data: { claimCode: null }, overrideAccess: true })
      const target = claimed.docs[0]
      if (!target) return json({ message: 'El link de activación no es válido o ya se usó. Pedí uno nuevo.' }, 410)
      try {
        await payload.create({
          collection: 'users',
          data: { email, password, role: 'staff', name: `${firstName} ${lastName}`, firstName, lastName, phone, signupAt: new Date().toISOString(), tenants: [{ tenant: target.id }] },
          overrideAccess: true,
        })
      } catch (err) {
        await payload.update({ collection: 'restaurants', id: target.id, data: { claimCode: codigo }, overrideAccess: true }).catch(() => {})
        payload.logger.error({ err }, 'claim signup failed')
        return json({ message: 'No pudimos crear la cuenta. Probá de nuevo o escribinos por WhatsApp.' }, 500)
      }
      return json({ ok: true, slug: target.slug, claimed: true }, 201)
    }

    const taken = await payload.find({
      collection: 'restaurants',
      where: { slug: { like: pickSlug(restaurantName, () => false) } },
      limit: 1000,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    const used = new Set(taken.docs.map((d) => d.slug))
    const slug = pickSlug(restaurantName, (s) => used.has(s))

    const now = new Date().toISOString()
    let restaurantId: number | string | undefined
    try {
      const restaurant = await payload.create({
        collection: 'restaurants',
        data: {
          name: restaurantName,
          slug,
          plan: 'free',
          publishApproved: false,
          // the owner's number is the natural WhatsApp for orders; they can change it in the panel
          whatsapp: phone,
          terms: { version: SIGNUP_TERMS_VERSION, acceptedAt: now, how: 'Registro web: casilla de aceptación marcada' },
        },
        overrideAccess: true,
      })
      restaurantId = restaurant.id
      await payload.create({
        collection: 'users',
        data: {
          email,
          password,
          role: 'staff',
          name: `${firstName} ${lastName}`,
          firstName,
          lastName,
          phone,
          signupAt: now,
          tenants: [{ tenant: restaurant.id }],
        },
        overrideAccess: true,
      })
    } catch (err) {
      // do not leave an orphan local behind when the account could not be created
      if (restaurantId != null) await payload.delete({ collection: 'restaurants', id: restaurantId, overrideAccess: true }).catch(() => {})
      payload.logger.error({ err }, 'signup failed')
      return json({ message: 'No pudimos crear la cuenta. Probá de nuevo o escribinos por WhatsApp.' }, 500)
    }
    return json({ ok: true, slug }, 201)
  },
}
