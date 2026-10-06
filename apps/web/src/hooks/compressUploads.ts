import { readFile } from 'fs/promises'
import type { CollectionBeforeOperationHook } from 'payload'

import { COMPRESSIBLE_TYPES, compressImage, webpName } from '../media/compress'
import { userLimits } from '../plans'
import { isStaffUser } from './planLimits'

/**
 * Photos uploaded by a restaurant on a plan that compresses uploads (Gratis) are shrunk before Payload stores them,
 * so the file kept, the thumbnail and what gets published all start from the small version. Runs before Payload
 * reads `req.file`. Pilots and paid plans are left alone.
 */
export const compressPlanUploads: CollectionBeforeOperationHook = async ({ args, operation, req }) => {
  if ((operation !== 'create' && operation !== 'update') || !req.file) return args
  if (!isStaffUser(req.user) || !userLimits(req.user).compressUploads) return args
  const file = req.file
  if (!COMPRESSIBLE_TYPES.has(file.mimetype)) return args

  const input = file.data?.length ? file.data : file.tempFilePath ? await readFile(file.tempFilePath) : null
  if (!input) return args
  const out = await compressImage(input, file.mimetype)
  if (!out.compressed) return args

  req.file = { ...file, data: out.data, mimetype: out.mimetype, name: webpName(file.name), size: out.data.length, tempFilePath: undefined }
  return args
}
