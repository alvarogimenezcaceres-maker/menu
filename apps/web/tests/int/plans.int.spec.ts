import { describe, expect, it } from 'vitest'

import {
  FREE_MAX_DISHES,
  FREE_MIN_TO_PUBLISH,
  FREE_PUBLISHES_PER_DAY,
  limitsFor,
  paraguayDay,
  publishBlock,
  publishesToday,
} from '../../src/plans'

const free = limitsFor('free')

describe('limitsFor', () => {
  it('caps the Gratis plan at 33 dishes (launch offer) with no 3D and basic ordering', () => {
    expect(free.maxDishes).toBe(FREE_MAX_DISHES)
    expect(FREE_MAX_DISHES).toBe(33)
    expect(free.scan3d).toBe(false)
    expect(free.basicOrdering).toBe(true)
    expect(free.needsApproval).toBe(true)
  })

  it('leaves paid plans and restaurants without a plan (the pilots) unlimited', () => {
    for (const plan of ['menu', 'pedidos', 'salon', null, undefined]) {
      const l = limitsFor(plan)
      expect(l.maxDishes).toBeNull()
      expect(l.scan3d).toBe(true)
      expect(l.basicOrdering).toBe(false)
      expect(l.needsApproval).toBe(false)
      expect(l.publishesPerDay).toBeNull()
    }
  })
})

describe('paraguayDay and publishesToday', () => {
  it('uses Paraguay time (UTC-3), so 01:00 UTC still belongs to the previous day', () => {
    expect(paraguayDay(new Date('2026-10-05T01:00:00Z'))).toBe('2026-10-04')
    expect(paraguayDay(new Date('2026-10-05T03:00:00Z'))).toBe('2026-10-05')
  })

  it('counts only publications made today', () => {
    expect(publishesToday({ publishDay: '2026-10-05', publishCount: 3 }, '2026-10-05')).toBe(3)
    expect(publishesToday({ publishDay: '2026-10-04', publishCount: 5 }, '2026-10-05')).toBe(0)
    expect(publishesToday({}, '2026-10-05')).toBe(0)
  })
})

describe('publishBlock on the Gratis plan', () => {
  const ok = { limits: free, isAdmin: false, approved: true, published: 9, today: 0, hasLogo: true, hasWhatsapp: true }

  it('lets an approved restaurant with 8 to 33 dishes publish', () => {
    expect(publishBlock(ok)).toBeNull()
    expect(publishBlock({ ...ok, published: FREE_MIN_TO_PUBLISH })).toBeNull()
    expect(publishBlock({ ...ok, published: FREE_MAX_DISHES })).toBeNull()
  })

  it('waits for approval before the first publication, as a request and not as an error', () => {
    const block = publishBlock({ ...ok, approved: false })
    expect(block?.status).toBe(403)
    expect(block?.kind).toBe('approval')
  })

  it('needs the WhatsApp number, because the Gratis menu orders only through it', () => {
    const block = publishBlock({ ...ok, hasWhatsapp: false })
    expect(block?.kind).toBe('fix')
    expect(block?.message).toContain('WhatsApp')
  })

  it('tells the local what it can fix (too few dishes) before asking it to wait for approval', () => {
    const block = publishBlock({ ...ok, approved: false, published: 3 })
    expect(block?.status).toBe(400)
    expect(block?.message).toContain('al menos 8')
  })

  it('asks for at least 8 dishes with a price', () => {
    const block = publishBlock({ ...ok, published: 7 })
    expect(block?.status).toBe(400)
    expect(block?.message).toContain('al menos 8')
  })

  it('refuses more than 33 published dishes', () => {
    const block = publishBlock({ ...ok, published: 35 })
    expect(block?.status).toBe(400)
    expect(block?.message).toContain('35')
  })

  it('stops after the daily publications', () => {
    expect(publishBlock({ ...ok, today: FREE_PUBLISHES_PER_DAY - 1 })).toBeNull()
    expect(publishBlock({ ...ok, today: FREE_PUBLISHES_PER_DAY })?.status).toBe(429)
  })

  it('lets a platform admin skip approval and the daily limit, but not the dish count', () => {
    expect(publishBlock({ ...ok, isAdmin: true, approved: false, today: 99 })).toBeNull()
    expect(publishBlock({ ...ok, isAdmin: true, published: 40 })?.status).toBe(400)
  })

  it('never blocks a restaurant without a plan', () => {
    const l = limitsFor(null)
    expect(publishBlock({ limits: l, isAdmin: false, approved: false, published: 40, today: 99, hasLogo: true, hasWhatsapp: false })).toBeNull()
  })

  it('needs the logo on every plan, because a menu without one breaks the build of all menus', () => {
    expect(publishBlock({ ...ok, hasLogo: false })?.message).toContain('logo')
    expect(publishBlock({ limits: limitsFor(null), isAdmin: true, approved: true, published: 40, today: 0, hasLogo: false, hasWhatsapp: true })?.status).toBe(400)
  })
})
