import config from '@payload-config'
import type { Metadata } from 'next'
import { getPayload } from 'payload'

import { FREE_MAX_DISHES } from '../../../plans'
import { RegistroForm } from './RegistroForm'
import './registro.css'

export const metadata: Metadata = {
  title: 'Creá tu local gratis · Mesaverso',
  description: 'Registrate y armá tu menú digital con QR.',
  robots: { index: false },
}

// the legal pages live on the sales site; set MESAVERSO_URL in the panel's environment once the domain exists
const landing = (process.env.MESAVERSO_URL || 'https://mesaverso.app').replace(/\/+$/, '')

export default async function RegistroPage({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const { codigo } = await searchParams
  let claim: { name: string; codigo: string } | null = null
  if (codigo && /^[A-Za-z0-9_-]{16,64}$/.test(codigo)) {
    const payload = await getPayload({ config })
    const found = await payload.find({ collection: 'restaurants', where: { claimCode: { equals: codigo } }, limit: 1, depth: 0, overrideAccess: true })
    if (found.docs[0]) claim = { name: found.docs[0].name, codigo }
  }
  const badCode = Boolean(codigo) && !claim

  return (
    <div className="reg">
      {claim ? (
        <>
          <h1>Activá tu acceso</h1>
          <p className="reg__lead">
            Creá tu usuario para administrar <strong>{claim.name}</strong>: vas a poder agregar y quitar productos, cambiar precios y publicar tu menú.
          </p>
        </>
      ) : badCode ? (
        <>
          <h1>Este link ya no sirve</h1>
          <p className="reg__lead">El link de activación no es válido o ya se usó. Pedí uno nuevo a quien te lo mandó.</p>
        </>
      ) : (
        <>
          <h1>Creá tu local</h1>
          <p className="reg__lead">
            Registrate y armá tu menú con hasta {FREE_MAX_DISHES} productos. Antes de que salga al aire lo revisamos nosotros y te avisamos por WhatsApp.
          </p>
        </>
      )}
      {!badCode && <RegistroForm claim={claim} termsUrl={`${landing}/terminos-gratis/`} privacyUrl={`${landing}/privacidad/`} />}
    </div>
  )
}
