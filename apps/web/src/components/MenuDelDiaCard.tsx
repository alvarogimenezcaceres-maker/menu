import React from 'react'

import { isPlatformAdmin, userRestaurantIds } from '../access/roles'

/** Dashboard shortcut for restaurant staff: the daily menu screen (platform admins do not see it). */
export function MenuDelDiaCard({ user }: { user?: unknown }) {
  if (!user || isPlatformAdmin(user) || userRestaurantIds(user)[0] == null) return null
  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 20,
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'grid', gap: 4, minWidth: 220, flex: '1 1 260px' }}>
        <strong style={{ fontSize: 17 }}>Menú del día</strong>
        <span style={{ color: 'var(--theme-elevation-600)' }}>
          Elegí los platos de hoy, cambiá nombres y precios y publicá, todo en una sola pantalla.
        </span>
      </div>
      <a
        href="/admin/menu-del-dia"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: 48,
          padding: '0 20px',
          borderRadius: 8,
          fontWeight: 700,
          textDecoration: 'none',
          background: 'var(--theme-text)',
          color: 'var(--theme-bg)',
        }}
      >
        Cambiar el menú de hoy
      </a>
    </div>
  )
}
