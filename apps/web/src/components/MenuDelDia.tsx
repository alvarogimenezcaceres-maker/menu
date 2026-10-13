import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { isPlatformAdmin, userRestaurantIds } from '../access/roles'
import type { Restaurant } from '../payload-types'
import { limitsFor } from '../plans'
import { MenuDelDiaClient } from './MenuDelDiaClient'

/**
 * «Menú del día»: one simple screen for restaurants that change their dishes every day (comedores, viandas).
 * The real work (list, switches, prices, publish) runs in the client component against the same REST API and rules
 * as the rest of the panel: plan limits, approval and publication limits are enforced by the server.
 */
export async function MenuDelDia({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  const user = req.user
  const restaurantId = userRestaurantIds(user)[0]

  let body: React.ReactNode
  if (!user) body = <p>Iniciá sesión para ver tu menú del día.</p>
  else if (isPlatformAdmin(user) || restaurantId == null)
    body = <p>Esta pantalla es para el personal de cada local. Como administrador, usá <a href="/admin/collections/dishes">Platos y bebidas</a>.</p>
  else {
    const r = (await req.payload.findByID({ collection: 'restaurants', id: restaurantId, depth: 0, overrideAccess: true })) as Restaurant
    const limits = limitsFor(r.plan)
    const menuUrl = process.env.MENU_BASE_URL ? `${process.env.MENU_BASE_URL.replace(/\/?$/, '/')}${r.slug}/` : ''
    body = (
      <MenuDelDiaClient
        restaurantId={r.id}
        restaurantName={r.name}
        tagline={r.tagline ?? ''}
        menuUrl={menuUrl}
        maxDishes={limits.maxDishes}
        minToPublish={limits.minToPublish}
        publishesPerDay={limits.publishesPerDay}
        needsApproval={limits.needsApproval}
        approved={Boolean(r.publishApproved)}
        published={Boolean(r.lastPublishedAt)}
      />
    )
  }

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={user || undefined}
      visibleEntities={visibleEntities}
    >
      <Gutter>{body}</Gutter>
    </DefaultTemplate>
  )
}
