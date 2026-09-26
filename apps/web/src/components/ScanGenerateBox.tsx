'use client'

import { Button, useDocumentInfo } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

type Scan = { status?: string | null; runUrl?: string | null; result?: string | null; error?: string | null; dish?: number | { id: number } }

const LABELS: Record<string, string> = { queued: 'En cola', processing: 'Procesando', done: 'Listo', failed: 'Falló' }
const box: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  padding: '16px 18px',
  marginBottom: 24,
  display: 'grid',
  gap: 8,
}

/** On a scan: «Generar 3D» button plus live status (refreshes while the job runs). */
export function ScanGenerateBox() {
  const { id } = useDocumentInfo()
  const [scan, setScan] = useState<Scan | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    const res = await fetch(`/api/scans/${id}?depth=0`, { credentials: 'include' })
    if (res.ok) setScan((await res.json()) as Scan)
  }, [id])

  const running = scan?.status === 'queued' || scan?.status === 'processing'
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!running) return
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [running, load])

  if (!id) return <div style={box}>Primero guardá el escaneo; después subí las fotos y generá el modelo.</div>

  const generate = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/scans/${id}/generate`, { method: 'POST', credentials: 'include' })
      const data = (await res.json()) as { message: string }
      setMessage({ text: data.message, error: !res.ok })
      await load()
    } catch {
      setMessage({ text: 'No se pudo conectar con el panel. Revisá tu conexión a internet.', error: true })
    } finally {
      setBusy(false)
    }
  }

  const dishId = typeof scan?.dish === 'object' ? scan.dish.id : scan?.dish
  return (
    <div style={box}>
      <strong style={{ fontSize: 15 }}>Generar 3D desde fotos</strong>
      <span style={{ color: 'var(--theme-elevation-600)', fontSize: 13 }}>
        Subí las fotos, guardá y tocá «Generar 3D». Tarda 15 a 25 minutos; podés cerrar esta página.
      </span>
      <div style={{ fontSize: 14 }}>
        Estado: <strong>{scan?.status ? LABELS[scan.status] : 'Sin generar'}</strong>
        {scan?.runUrl && (
          <>
            {' · '}
            <a href={scan.runUrl} target="_blank" rel="noreferrer">
              Ver el proceso
            </a>
          </>
        )}
      </div>
      {scan?.status === 'done' && (
        <div style={{ fontSize: 13, color: 'var(--theme-success-500)' }}>
          Modelo guardado en el plato ({scan.result}).{' '}
          {dishId && <a href={`/admin/collections/dishes/${dishId}`}>Abrir el plato</a>} y después publicá el menú.
        </div>
      )}
      {scan?.status === 'failed' && (
        <div style={{ fontSize: 13, color: 'var(--theme-error-500)' }}>
          {scan.error} Las fotos se borraron: subí otras (más luz, más superposición) y probá de nuevo.
        </div>
      )}
      <div>
        <Button buttonStyle="primary" size="medium" onClick={generate} disabled={busy || running || scan?.status === 'done'}>
          {busy ? 'Encolando…' : 'Generar 3D'}
        </Button>
      </div>
      {message && (
        <div role="status" style={{ fontSize: 13, color: message.error ? 'var(--theme-error-500)' : 'var(--theme-success-500)' }}>
          {message.text}
        </div>
      )}
    </div>
  )
}
