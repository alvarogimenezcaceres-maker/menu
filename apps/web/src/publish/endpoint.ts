import type { Endpoint } from 'payload'

import { exportRestaurant } from './export'
import { commitAndPush } from './git'

let busy = false

export const publishEndpoint: Endpoint = {
  path: '/:id/publish',
  method: 'post',
  handler: async (req) => {
    if (!req.user) return Response.json({ message: 'Iniciá sesión para publicar.' }, { status: 401 })
    const id = req.routeParams?.id as string
    try {
      // access check with the user's own permissions
      await req.payload.findByID({ collection: 'restaurants', id, user: req.user, overrideAccess: false, depth: 0 })
    } catch {
      return Response.json({ message: 'No tenés permiso para publicar este restaurante.' }, { status: 403 })
    }
    if (busy) return Response.json({ message: 'Ya hay una publicación en curso. Probá de nuevo en unos segundos.' }, { status: 409 })

    busy = true
    try {
      const out = await exportRestaurant(req.payload, id)
      const who = (req.user as { name?: string; email?: string }).name || (req.user as { email?: string }).email
      const result = await commitAndPush(out.relDir, `Menú ${out.name}: publicado desde el panel (${who})`)
      await req.payload.update({ collection: 'restaurants', id, data: { lastPublishedAt: new Date().toISOString() }, overrideAccess: true })

      const base = process.env.MENU_BASE_URL ? process.env.MENU_BASE_URL.replace(/\/?$/, '/') : ''
      return Response.json({
        changed: result.changed,
        commit: result.changed ? result.commit : undefined,
        published: out.published,
        menuUrl: base ? `${base}${out.slug}/` : undefined,
        actionsUrl: process.env.GITHUB_REPO ? `https://github.com/${process.env.GITHUB_REPO}/actions` : undefined,
        message: result.changed
          ? `Publicado: ${out.published} ítems. El menú en línea se actualiza en 1 a 2 minutos.`
          : 'No había cambios nuevos: el menú en línea ya está al día.',
      })
    } catch (e) {
      req.payload.logger.error({ err: e }, 'publish failed')
      const detail = e instanceof Error ? e.message.split('\n')[0] : String(e)
      return Response.json(
        { message: `No se pudo publicar. Revisá la conexión a internet y volvé a intentar. Detalle: ${detail}` },
        { status: 500 },
      )
    } finally {
      busy = false
    }
  },
}
