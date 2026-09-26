'use client'

import { Button, useDocumentInfo } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

type Scan = { id: number; status?: string | null; createdAt: string }

const LABELS: Record<string, string> = { queued: 'en cola', processing: 'procesando', done: 'listo', failed: 'falló' }

/** On a dish: last scan's status and a button that starts a new «Generar 3D desde fotos». */
export function DishScanBox() {
  const { id } = useDocumentInfo()
  const [last, setLast] = useState<Scan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/scans?where[dish][equals]=${id}&sort=-createdAt&limit=1&depth=0`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { docs?: Scan[] } | null) => setLast(d?.docs?.[0] ?? null))
      .catch(() => undefined)
  }, [id])

  if (!id) return null

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish: id }),
      })
      const data = (await res.json()) as { doc?: { id: number }; errors?: { message: string }[] }
      if (!res.ok || !data.doc) throw new Error(data.errors?.[0]?.message ?? 'No se pudo crear el escaneo.')
      window.location.href = `/admin/collections/scans/${data.doc.id}`
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 24 }}>
      <Button buttonStyle="secondary" size="medium" onClick={start} disabled={busy} margin={false}>
        {busy ? 'Creando…' : 'Generar 3D desde fotos'}
      </Button>
      {last && (
        <span style={{ fontSize: 13 }}>
          Último escaneo: <a href={`/admin/collections/scans/${last.id}`}>{last.status ? LABELS[last.status] : 'sin generar'}</a>
        </span>
      )}
      {error && <span style={{ fontSize: 13, color: 'var(--theme-error-500)' }}>{error}</span>}
    </div>
  )
}
