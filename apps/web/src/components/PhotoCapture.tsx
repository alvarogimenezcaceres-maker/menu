'use client'

import { useField, useFormFields } from '@payloadcms/ui'
import React, { useRef, useState } from 'react'

const MAX_SIDE = 1600

/** Shrinks a photo in the browser before sending it, so a slow phone connection does not carry 5 MB. The server compresses again. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8))
    return blob && blob.type === 'image/webp' && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

const idOf = (v: unknown): number | string | null => {
  if (v && typeof v === 'object' && 'id' in v) return (v as { id: number | string }).id
  return typeof v === 'number' || typeof v === 'string' ? v : null
}

/** «Sacar foto»: opens the phone camera and puts the photo in the dish's Foto field. Gallery files still go through the field below. */
export function PhotoCapture() {
  const { setValue } = useField<number | string | null>({ path: 'photo' })
  const dishName = useFormFields(([fields]) => fields.name?.value) as string | undefined
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const upload = async (file: File) => {
    setState('busy')
    setMessage('')
    try {
      const small = await shrink(file)
      const me = await fetch('/api/users/me', { credentials: 'include' }).then((r) => r.json())
      const tenant = idOf(me?.user?.tenants?.[0]?.tenant)
      const body = new FormData()
      body.append('file', small, small === file ? file.name : file.name.replace(/\.[^.]+$/, '') + '.webp')
      body.append('_payload', JSON.stringify({ alt: dishName?.trim() || 'Foto de un plato', ...(tenant != null ? { tenant } : {}) }))
      const res = await fetch('/api/media', { method: 'POST', credentials: 'include', body })
      const json = await res.json()
      const id = idOf(json?.doc)
      if (!res.ok || id == null) throw new Error(json?.errors?.[0]?.message || json?.message || 'upload failed')
      setValue(id)
      setState('done')
      setMessage('Listo: la foto quedó en el plato. Tocá «Guardar» para confirmar.')
    } catch {
      setState('error')
      setMessage('No se pudo subir la foto. Probá de nuevo o elegila de tu galería en el campo «Foto».')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={state === 'busy'}
        style={{
          minHeight: 48,
          padding: '0 18px',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
          cursor: state === 'busy' ? 'wait' : 'pointer',
          border: '1px solid var(--theme-text)',
          background: 'var(--theme-text)',
          color: 'var(--theme-bg)',
          justifySelf: 'start',
        }}
      >
        {state === 'busy' ? 'Subiendo…' : 'Sacar foto con la cámara'}
      </button>
      <span style={{ color: 'var(--theme-elevation-700)', fontSize: 13 }}>
        Con luz natural y desde arriba se ve mejor. Si ya tenés la foto en tu galería, elegila en el campo «Foto» de abajo.
      </span>
      {message && (
        <span role="status" style={{ fontSize: 13, color: state === 'error' ? 'var(--theme-error-500)' : 'var(--theme-success-500)' }}>
          {message}
        </span>
      )}
    </div>
  )
}
