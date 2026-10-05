import type { Payload, Where } from 'payload'
import React from 'react'

import { isPlatformAdmin, userRestaurantIds } from '../access/roles'
import type { Restaurant } from '../payload-types'
import { limitsFor } from '../plans'

type Props = { payload: Payload; user?: unknown }

const card: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  padding: '18px 20px',
  marginBottom: 24,
  display: 'grid',
  gap: 14,
}
const link: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 16px',
  borderRadius: 6,
  fontWeight: 600,
  textDecoration: 'none',
  border: '1px solid var(--theme-elevation-250)',
  color: 'var(--theme-text)',
}
const primary: React.CSSProperties = { ...link, background: 'var(--theme-text)', color: 'var(--theme-bg)', borderColor: 'var(--theme-text)' }

const count = (payload: Payload, collection: 'dishes' | 'categories', and: Where[]) =>
  payload.count({ collection, where: { and }, overrideAccess: true }).then((r) => r.totalDocs)

/** Counts that drive the checklist, for one restaurant. */
async function progress(payload: Payload, restaurantId: number | string) {
  const tenant = { tenant: { equals: restaurantId } }
  const priced = { price: { exists: true } }
  const visible = { visible: { not_equals: false } }
  const [categories, dishes, withPrice, withPhoto] = await Promise.all([
    count(payload, 'categories', [tenant]),
    count(payload, 'dishes', [tenant]),
    count(payload, 'dishes', [tenant, priced, visible]),
    count(payload, 'dishes', [tenant, priced, visible, { photo: { exists: true } }]),
  ])
  return { categories, dishes, withPrice, withPhoto }
}

/** Dashboard block. Staff see a checklist to get their menu live; platform admins see the Gratis menus waiting for approval. */
export async function StartGuide({ payload, user }: Props) {
  if (!user) return null
  if (isPlatformAdmin(user)) return <PendingApprovals payload={payload} />

  const restaurantId = userRestaurantIds(user)[0]
  if (restaurantId == null) return null
  const r = (await payload.findByID({ collection: 'restaurants', id: restaurantId, depth: 0, overrideAccess: true })) as Restaurant
  const limits = limitsFor(r.plan)
  const need = limits.minToPublish || 1
  const p = await progress(payload, r.id)
  const published = Boolean(r.lastPublishedAt)
  const restaurantUrl = `/admin/collections/restaurants/${r.id}`
  const menuUrl = process.env.MENU_BASE_URL ? `${process.env.MENU_BASE_URL.replace(/\/?$/, '/')}${r.slug}/` : null

  const steps = [
    {
      title: 'Completá los datos de tu local',
      text: 'Tu nombre, el WhatsApp donde querés recibir los pedidos y tu logo.',
      done: Boolean(r.whatsapp?.trim()),
      href: restaurantUrl,
      cta: 'Completar datos',
    },
    {
      title: 'Armá las categorías de tu menú',
      text: 'Por ejemplo: Entradas, Platos principales, Bebidas, Postres.',
      done: p.categories >= 1,
      href: '/admin/collections/categories/create',
      cta: 'Crear categoría',
    },
    {
      title: `Cargá tus productos con precio${limits.maxDishes ? ` (hasta ${limits.maxDishes})` : ''}`,
      text:
        limits.maxDishes != null
          ? `Elegí tus ${limits.maxDishes} platos más pedidos: tenés ${p.dishes} de ${limits.maxDishes}. Necesitás al menos ${need} con precio para publicar.`
          : `Necesitás al menos ${need} con precio para publicar. Tenés ${p.withPrice}.`,
      done: p.withPrice >= need,
      href: '/admin/collections/dishes/create',
      cta: 'Crear producto',
    },
    {
      title: 'Sumá una foto a cada producto',
      text: `Fotos reales de tus platos, con buena luz y desde arriba. Tenés ${p.withPhoto} de ${Math.max(need, p.withPrice)} con foto.`,
      done: p.withPhoto >= need,
      href: '/admin/collections/dishes',
      cta: 'Ver mis productos',
    },
    {
      title: 'Publicá y compartí tu menú',
      text: published
        ? 'Tu menú ya está en línea. Mandate un pedido de prueba a tu WhatsApp y pegá el link en tu bio de Instagram.'
        : limits.needsApproval && !r.publishApproved
          ? 'Cuando tengas todo lo anterior, tocá «Publicar» dentro de tu restaurante: nuestro equipo lo revisa y te avisa por WhatsApp. No pasa nada si todavía no lo aprobamos.'
          : 'Tocá «Publicar» dentro de tu restaurante. En 1 o 2 minutos tu menú está en línea.',
      done: published,
      href: restaurantUrl,
      cta: published ? 'Ver mi restaurante' : 'Ir a publicar',
    },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const next = steps.findIndex((s) => !s.done)

  return (
    <div style={card}>
      <div style={{ display: 'grid', gap: 4 }}>
        <strong style={{ fontSize: 18 }}>
          {next === -1 ? 'Tu menú está listo' : `Bienvenido, ${r.name}: armemos tu menú en 5 pasos`}
        </strong>
        <span style={{ color: 'var(--theme-elevation-600)' }}>
          {doneCount} de {steps.length} pasos hechos
          {limits.maxDishes != null ? ` · Plan Gratis: ${p.dishes} de ${limits.maxDishes} productos` : ''}
        </span>
        <div
          role="progressbar"
          aria-label="Pasos hechos"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
          style={{ height: 8, borderRadius: 6, background: 'var(--theme-elevation-100)', overflow: 'hidden', marginTop: 6 }}
        >
          <div style={{ width: `${(doneCount / steps.length) * 100}%`, height: '100%', background: 'var(--theme-success-500)' }} />
        </div>
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {steps.map((s, i) => {
          const isNext = i === next
          return (
            <li
              key={s.title}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px minmax(0, 1fr)',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 8,
                border: `1px solid ${isNext ? 'var(--theme-text)' : 'var(--theme-elevation-100)'}`,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  fontWeight: 700,
                  background: s.done ? 'var(--theme-success-500)' : 'var(--theme-elevation-100)',
                  color: s.done ? '#fff' : 'var(--theme-text)',
                }}
              >
                {s.done ? '✓' : i + 1}
              </span>
              <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                <strong>
                  {s.title} <span style={{ fontWeight: 500, color: 'var(--theme-elevation-600)' }}>· {s.done ? 'Hecho' : isNext ? 'Siguiente paso' : 'Pendiente'}</span>
                </strong>
                <span style={{ color: 'var(--theme-elevation-700)' }}>{s.text}</span>
                {(!s.done || i === steps.length - 1) && (
                  <span>
                    <a href={s.href} style={isNext ? primary : link}>
                      {s.cta}
                    </a>
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {published && menuUrl && (
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ color: 'var(--theme-elevation-600)' }}>El link de tu menú:</span>
          <a href={menuUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600, wordBreak: 'break-all' }}>
            {menuUrl}
          </a>
        </div>
      )}
      <span style={{ color: 'var(--theme-elevation-600)', fontSize: 13 }}>
        ¿Algo no sale? El panel puede tardar un minuto en responder la primera vez; esperá y probá de nuevo.
      </span>
    </div>
  )
}

/** Platform admins: Gratis menus that still need approval to publish, with how ready each one is. */
async function PendingApprovals({ payload }: { payload: Payload }) {
  const pending = (
    await payload.find({
      collection: 'restaurants',
      where: { and: [{ plan: { equals: 'free' } }, { publishApproved: { not_equals: true } }] },
      limit: 50,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as Restaurant[]
  if (!pending.length) return null
  const rows = await Promise.all(pending.map(async (r) => ({ r, p: await progress(payload, r.id) })))
  const min = limitsFor('free').minToPublish

  return (
    <div style={card}>
      <strong style={{ fontSize: 18 }}>Menús Gratis esperando aprobación ({rows.length})</strong>
      <span style={{ color: 'var(--theme-elevation-600)' }}>
        Revisá fotos, nombres y precios. Cuando estén bien, tildá «Publicación aprobada» en el restaurante.
      </span>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {rows.map(({ r, p }) => {
          const ready = p.withPrice >= min
          return (
            <li key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'center', justifyContent: 'space-between' }}>
              <a href={`/admin/collections/restaurants/${r.id}`} style={{ fontWeight: 600 }}>
                {r.name}
              </a>
              <span style={{ color: 'var(--theme-elevation-700)' }}>
                {p.withPrice} con precio · {p.withPhoto} con foto · {ready ? 'Listo para revisar' : `Faltan ${min - p.withPrice} para el mínimo`}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
