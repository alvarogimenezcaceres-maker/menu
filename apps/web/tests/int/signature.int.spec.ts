import { describe, expect, it } from 'vitest'

import { signBody, verifyWorkerSignature } from '../../src/scans/signature'

const secret = 'test-secret'
const body = JSON.stringify({ scan: 7, ok: true })
const now = 1_790_000_000_000
const ts = String(now / 1000)

describe('worker signature', () => {
  it('accepts a fresh, correctly signed body', () => {
    expect(verifyWorkerSignature(secret, ts, signBody(secret, ts, body), body, now)).toBe(true)
  })
  it('rejects a changed body, a wrong secret or a missing secret', () => {
    const sig = signBody(secret, ts, body)
    expect(verifyWorkerSignature(secret, ts, sig, body.replace('7', '8'), now)).toBe(false)
    expect(verifyWorkerSignature('other', ts, sig, body, now)).toBe(false)
    expect(verifyWorkerSignature(undefined, ts, sig, body, now)).toBe(false)
  })
  it('rejects old or future timestamps', () => {
    const old = String(now / 1000 - 301)
    const future = String(now / 1000 + 301)
    expect(verifyWorkerSignature(secret, old, signBody(secret, old, body), body, now)).toBe(false)
    expect(verifyWorkerSignature(secret, future, signBody(secret, future, body), body, now)).toBe(false)
  })
  it('rejects malformed headers', () => {
    expect(verifyWorkerSignature(secret, 'abc', 'zz', body, now)).toBe(false)
    expect(verifyWorkerSignature(secret, null, null, body, now)).toBe(false)
  })
})
