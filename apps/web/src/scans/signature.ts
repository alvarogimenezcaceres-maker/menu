import { createHmac, timingSafeEqual } from 'crypto'

/** Requests older or newer than this are rejected, so a captured request can't be replayed later. */
export const MAX_SKEW_SECONDS = 300

export const signBody = (secret: string, timestamp: string, body: string): string =>
  createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')

/**
 * Checks a request from the photogrammetry worker (workers/3d/job.mjs):
 * X-Worker-Signature = hex HMAC-SHA256(WORKER_SECRET, "<X-Worker-Timestamp>.<raw body>").
 */
export function verifyWorkerSignature(
  secret: string | undefined,
  timestamp: string | null,
  signature: string | null,
  body: string,
  nowMs = Date.now(),
): boolean {
  if (!secret || !timestamp || !signature || !/^\d{9,11}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return false
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) return false
  const expected = Buffer.from(signBody(secret, timestamp, body), 'hex')
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
}
