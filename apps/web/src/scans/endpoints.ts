import type { Endpoint, PayloadRequest } from 'payload'

import type { Dish, Media, Scan, ScanPhoto } from '../payload-types'
import { commitJobFile } from './job-file'
import { deleteMediaIfUnused } from './media-cleanup'
import { verifyWorkerSignature } from './signature'

export const MIN_PHOTOS = 30
export const MAX_PHOTOS = 120

const idOf = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id: number }).id ?? null) : typeof v === 'number' ? v : null

const workflowUrl = () =>
  process.env.GITHUB_REPO ? `https://github.com/${process.env.GITHUB_REPO}/actions/workflows/photogrammetry.yml` : undefined

/** Staff button «Generar 3D»: checks the scan, then queues the job for GitHub Actions. */
export const generateEndpoint: Endpoint = {
  path: '/:id/generate',
  method: 'post',
  handler: async (req) => {
    if (!req.user) return Response.json({ message: 'Iniciá sesión para generar el modelo.' }, { status: 401 })
    const id = req.routeParams?.id as string
    let scan: Scan
    try {
      // the user's own permissions: staff only reach their restaurant's scans and dishes
      scan = (await req.payload.findByID({ collection: 'scans', id, user: req.user, overrideAccess: false, depth: 0 })) as Scan
      await req.payload.findByID({ collection: 'dishes', id: idOf(scan.dish)!, user: req.user, overrideAccess: false, depth: 0 })
    } catch {
      return Response.json({ message: 'No tenés permiso para este plato.' }, { status: 403 })
    }
    if (scan.status === 'queued' || scan.status === 'processing')
      return Response.json({ message: 'Este escaneo ya se está procesando.' }, { status: 409 })
    if (scan.status === 'done') return Response.json({ message: 'Este escaneo ya terminó. Para otro modelo, creá un escaneo nuevo.' }, { status: 409 })
    const photos = scan.photos?.length ?? 0
    if (photos < MIN_PHOTOS || photos > MAX_PHOTOS)
      return Response.json({ message: `Subí entre ${MIN_PHOTOS} y ${MAX_PHOTOS} fotos (ahora hay ${photos}) y guardá.` }, { status: 400 })
    if (!scan.diameterCm) return Response.json({ message: 'Completá el diámetro real del plato y guardá.' }, { status: 400 })
    if (!process.env.GITHUB_TOKEN)
      return Response.json({ message: 'La generación 3D solo funciona en el panel en la nube.' }, { status: 503 })

    try {
      await commitJobFile(scan.id)
    } catch (e) {
      req.payload.logger.error({ err: e }, 'scan job commit failed')
      return Response.json({ message: 'No se pudo encolar el trabajo. Probá de nuevo en un minuto.' }, { status: 502 })
    }
    await req.payload.update({
      collection: 'scans',
      id: scan.id,
      data: { status: 'queued', runUrl: workflowUrl(), error: null, requestedAt: new Date().toISOString() },
      overrideAccess: true,
    })
    return Response.json({ message: 'En cola. El modelo suele estar listo en 15 a 25 minutos.' })
  },
}

/** Reads and checks a signed worker request; returns the parsed body or an error response. */
async function workerBody<T>(req: PayloadRequest): Promise<T | Response> {
  const raw = (await req.text?.()) ?? ''
  const ok = verifyWorkerSignature(
    process.env.WORKER_SECRET,
    req.headers.get('x-worker-timestamp'),
    req.headers.get('x-worker-signature'),
    raw,
  )
  if (!ok) return Response.json({ message: 'invalid signature' }, { status: 401 })
  try {
    return JSON.parse(raw) as T
  } catch {
    return Response.json({ message: 'invalid body' }, { status: 400 })
  }
}

async function findScan(req: PayloadRequest, id: unknown, depth: number): Promise<Scan | null> {
  if (typeof id !== 'number') return null
  try {
    return (await req.payload.findByID({ collection: 'scans', id, depth, overrideAccess: true })) as Scan
  } catch {
    return null
  }
}

/** Worker step 1: marks the scan as processing and hands out the photo URLs. */
export const workerStartEndpoint: Endpoint = {
  path: '/worker/start',
  method: 'post',
  handler: async (req) => {
    const body = await workerBody<{ scan: number; runUrl?: string }>(req)
    if (body instanceof Response) return body
    const scan = await findScan(req, body.scan, 1)
    if (!scan) return Response.json({ message: 'scan not found' }, { status: 404 })
    if (scan.status !== 'queued' && scan.status !== 'processing')
      return Response.json({ message: `scan is ${scan.status ?? 'not queued'}` }, { status: 409 })
    const photos = (scan.photos ?? [])
      .map((p) => (typeof p === 'object' ? (p as ScanPhoto).url : null))
      .filter((url): url is string => Boolean(url?.startsWith('https://')))
    if (!photos.length) return Response.json({ message: 'scan has no downloadable photos' }, { status: 409 })
    await req.payload.update({
      collection: 'scans',
      id: scan.id,
      data: { status: 'processing', ...(body.runUrl?.startsWith('https://github.com/') ? { runUrl: body.runUrl } : {}) },
      overrideAccess: true,
    })
    return Response.json({ diameterCm: scan.diameterCm, photos: photos.map((url) => ({ url })) })
  },
}

type FinishBody = {
  scan: number
  ok: boolean
  error?: string
  model?: string // base64 GLB
  poster?: string // base64 PNG
  report?: { seconds?: number; glbBytes?: number; errors?: number; warnings?: number; triangles?: number }
}

const isGlb = (b: Buffer) => b.length > 12 && b.toString('ascii', 0, 4) === 'glTF'
const isPng = (b: Buffer) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47
// posters this endpoint names `${slug}-3d-${scanId}.png` (Payload may append -1, -2… on clashes)
const isScanPoster = (m: Dish['photo']) =>
  typeof m === 'object' && !!m && /-3d-\d+(-\d+)?\.png$/.test((m as Media).filename ?? '')

/**
 * Worker step 2: attaches the GLB as the dish model (and the poster as its photo when it has none or
 * only an earlier scan's poster), deletes the replaced files nothing else uses, then deletes the scan
 * photos from storage. A failure inside the panel answers 500 without touching
 * the scan, so the worker retries and, if it still fails, reports the job as failed.
 */
export const workerFinishEndpoint: Endpoint = {
  path: '/worker/finish',
  method: 'post',
  handler: async (req) => {
    const body = await workerBody<FinishBody>(req)
    if (body instanceof Response) return body
    const scan = await findScan(req, body.scan, 0)
    if (!scan) return Response.json({ message: 'scan not found' }, { status: 404 })
    if (scan.status === 'done' || scan.status === 'failed')
      return Response.json({ message: `scan already ${scan.status}` })

    const finishedAt = new Date().toISOString()
    let status: Record<string, unknown>
    if (body.ok) {
      const glb = Buffer.from(body.model ?? '', 'base64')
      const poster = Buffer.from(body.poster ?? '', 'base64')
      if (!isGlb(glb)) return Response.json({ message: 'model is not a GLB' }, { status: 400 })
      try {
        const dish = (await req.payload.findByID({ collection: 'dishes', id: idOf(scan.dish)!, depth: 1, overrideAccess: true })) as Dish
        const tenant = idOf(scan.tenant)
        const model = await req.payload.create({
          collection: 'media',
          data: { alt: `Modelo 3D: ${dish.name}`, tenant },
          file: { data: glb, mimetype: 'model/gltf-binary', name: `${dish.slug}-3d-${scan.id}.glb`, size: glb.length },
          overrideAccess: true,
          depth: 0,
        })
        // a photo someone uploaded stays; a poster from an earlier scan is replaced by the new one
        let photo: number | undefined
        if ((!dish.photo || isScanPoster(dish.photo)) && isPng(poster)) {
          const doc = await req.payload.create({
            collection: 'media',
            data: { alt: dish.name, tenant },
            file: { data: poster, mimetype: 'image/png', name: `${dish.slug}-3d-${scan.id}.png`, size: poster.length },
            overrideAccess: true,
            depth: 0,
          })
          photo = doc.id
        }
        await req.payload.update({
          collection: 'dishes',
          id: dish.id,
          data: { model: model.id, ...(photo ? { photo } : {}) },
          overrideAccess: true,
          depth: 0,
        })
        // the replaced model (and poster) would otherwise stay in UploadThing's 2 GB for good
        await deleteMediaIfUnused(req.payload, idOf(dish.model))
        if (photo) await deleteMediaIfUnused(req.payload, idOf(dish.photo))
      } catch (e) {
        req.payload.logger.error({ err: e }, 'scan finish: attaching the model failed')
        return Response.json({ message: 'could not attach the model' }, { status: 500 })
      }
      const r = body.report ?? {}
      const summary = [
        r.seconds ? `${Math.max(1, Math.round(r.seconds / 60))} min` : null,
        `${(glb.length / 1048576).toFixed(1)} MB`,
        r.triangles ? `${r.triangles.toLocaleString('es-PY')} triángulos` : null,
        r.errors != null ? `${r.errors} errores de validación` : null,
      ].filter(Boolean)
      status = { status: 'done', error: null, result: summary.join(' · ') }
    } else {
      status = { status: 'failed', error: String(body.error ?? 'Falló el procesamiento').slice(0, 300) }
    }

    // keep only the GLB and the poster: the photos would fill the 2 GB of UploadThing's free plan
    const photoIds = (scan.photos ?? []).map(idOf).filter((id): id is number => id != null)
    await req.payload.update({
      collection: 'scans',
      id: scan.id,
      data: { ...status, finishedAt, photos: [] },
      overrideAccess: true,
    })
    if (photoIds.length) {
      const res = await req.payload.delete({ collection: 'scan-photos', where: { id: { in: photoIds } }, overrideAccess: true })
      if (res.errors.length) req.payload.logger.error({ errors: res.errors }, 'scan finish: some photos were not deleted')
    }
    return Response.json({ message: `scan ${status.status}` })
  },
}
