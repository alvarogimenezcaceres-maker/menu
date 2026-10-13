import { describe, expect, it } from 'vitest'

import { makeLimiter, normalizePhone, pickSlug, validateSignup } from '../../src/signup/validate'

const good = {
  firstName: 'Ana',
  lastName: 'Benítez',
  email: ' Ana@Example.com ',
  phone: '0981 123 456',
  password: 'una-clave-larga',
  restaurantName: 'Pizza  Sol',
  terms: true,
}

describe('signup validation', () => {
  it('accepts a complete form and normalises it', () => {
    const r = validateSignup(good)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.email).toBe('ana@example.com')
      expect(r.data.phone).toBe('+595981123456')
      expect(r.data.restaurantName).toBe('Pizza Sol')
    }
  })

  it('reports each missing field', () => {
    const r = validateSignup({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['email', 'firstName', 'lastName', 'password', 'phone', 'restaurantName', 'terms'])
  })

  it('requires the terms to be accepted explicitly', () => {
    const r = validateSignup({ ...good, terms: 'true' })
    expect(r.ok).toBe(false)
  })

  it('rejects short passwords and bad emails', () => {
    const r = validateSignup({ ...good, password: 'corta', email: 'nope' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['email', 'password'])
  })
})

describe('activation code', () => {
  const code = 'abcdEFGH1234-_xyz9876'
  it('lets an invited owner skip the restaurant name', () => {
    const r = validateSignup({ ...good, restaurantName: '', codigo: code })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.codigo).toBe(code)
  })
  it('rejects a malformed code', () => {
    const r = validateSignup({ ...good, codigo: 'corto' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.codigo).toBeTruthy()
  })
})

describe('normalizePhone', () => {
  it.each([
    ['0981 123 456', '+595981123456'],
    ['+595 981 123456', '+595981123456'],
    ['595981123456', '+595981123456'],
    ['(021) 123-456', '+59521123456'],
  ])('%s', (input, out) => expect(normalizePhone(input)).toBe(out))

  it.each(['', 'abc', '123', '0981'])('rejects %s', (input) => expect(normalizePhone(input)).toBeNull())
})

describe('pickSlug', () => {
  it('adds a number when the slug is taken and skips reserved ones', () => {
    expect(pickSlug('Pizza Sol', () => false)).toBe('pizza-sol')
    expect(pickSlug('Pizza Sol', (s) => s === 'pizza-sol')).toBe('pizza-sol-2')
    expect(pickSlug('QR', () => false)).toBe('qr-2')
  })
})

describe('makeLimiter', () => {
  it('allows max hits per window', () => {
    const allow = makeLimiter(2, 1000)
    expect(allow('a', 0)).toBe(true)
    expect(allow('a', 10)).toBe(true)
    expect(allow('a', 20)).toBe(false)
    expect(allow('b', 20)).toBe(true)
    expect(allow('a', 1500)).toBe(true)
  })
})
