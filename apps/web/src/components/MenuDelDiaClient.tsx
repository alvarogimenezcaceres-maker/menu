'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Category = { id: number | string; name: string }
type Dish = { id: number | string; name: string; price: number | null; visible: boolean; soldOut: boolean; categoryId: number | string | null }

type Props = {
  restaurantId: number | string
  restaurantName: string
  tagline: string
  menuUrl: string
  maxDishes: number | null
  minToPublish: number
  publishesPerDay: number | null
  needsApproval: boolean
  approved: boolean
  published: boolean
}

const gs = (n: number | null | undefined) => (n == null ? '' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'))
const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
const todayName = () => norm(new Date().toLocaleDateString('es-PY', { weekday: 'long', timeZone: 'America/Asuncion' }))
const toNum = (s: string) => {
  const d = s.replace(/\D/g, '')
  return d ? Number(d) : null
}

const apiError = async (res: Response) => {
  try {
    const j = (await res.json()) as { errors?: { message?: string }[]; message?: string }
    return j.errors?.[0]?.message || j.message || `Error ${res.status}`
  } catch {
    return `Error ${res.status}`
  }
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await apiError(res))
  return res.json() as Promise<Record<string, unknown>>
}

const CSS = `
.mdd{max-width:760px;margin:0 auto;padding-bottom:120px;display:grid;gap:18px}
.mdd h1{font-size:26px;margin:0}
.mdd p{margin:0}
.mdd-muted{color:var(--theme-elevation-600);font-size:14px}
.mdd-card{border:1px solid var(--theme-elevation-150);border-radius:10px;padding:14px 16px;display:grid;gap:10px;background:var(--theme-elevation-0,transparent)}
.mdd-cat{font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--theme-elevation-600);margin:10px 0 -4px}
.mdd-row{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;border:1px solid var(--theme-elevation-150);border-radius:10px;padding:10px 12px}
.mdd-row.is-off{opacity:.62}
.mdd-sw{display:inline-flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;font-weight:600;font-size:14px}
.mdd-sw input{width:26px;height:26px;accent-color:var(--theme-success-500)}
.mdd-fields{display:grid;grid-template-columns:1fr 130px;gap:8px;align-items:center}
.mdd input[type=text],.mdd select{width:100%;min-height:44px;padding:0 12px;border:1px solid var(--theme-elevation-250);border-radius:8px;background:var(--theme-input-bg,var(--theme-bg));color:var(--theme-text);font:inherit;font-size:16px}
.mdd-sub{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:13px;color:var(--theme-elevation-600)}
.mdd-sub label{display:inline-flex;gap:6px;align-items:center;min-height:36px}
.mdd-ok{color:var(--theme-success-500)}
.mdd-err{color:var(--theme-error-500)}
.mdd-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:10px;border:1px solid var(--theme-elevation-250);background:transparent;color:var(--theme-text);font:inherit;font-weight:700;cursor:pointer}
.mdd-btn--main{background:var(--theme-text);color:var(--theme-bg);border-color:var(--theme-text)}
.mdd-btn:disabled{opacity:.55;cursor:wait}
 .mdd-add{display:grid;gap:8px}
.mdd-chips{display:flex;flex-wrap:wrap;gap:8px}
.mdd-chip{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--theme-elevation-250);background:transparent;color:var(--theme-text);font:inherit;font-weight:600;cursor:pointer}
.mdd-chip.is-today{border-color:var(--theme-success-500)}
.mdd-chip small{font-weight:500;color:var(--theme-success-500)}
.mdd-copy{min-height:36px!important;width:auto!important;font-size:13px!important;padding:0 8px!important}
.mdd-bar{position:fixed;left:0;right:0;bottom:0;z-index:20;background:var(--theme-bg);border-top:1px solid var(--theme-elevation-150);padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));display:grid;gap:6px;justify-items:center}
.mdd-bar__in{width:100%;max-width:760px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
@media(max-width:560px){.mdd-fields{grid-template-columns:1fr}}
`

function DishRow({ dish, cats, onSave, onCopy }: { dish: Dish; cats: Category[]; onSave: (id: Dish['id'], patch: Partial<Dish>) => Promise<string | null>; onCopy: (d: Dish, catId: Category['id']) => Promise<string | null> }) {
  const [name, setName] = useState(dish.name)
  const [price, setPrice] = useState(gs(dish.price))
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { setName(dish.name); setPrice(gs(dish.price)) }, [dish.name, dish.price])

  const save = async (patch: Partial<Dish>) => {
    setStatus({ ok: true, text: 'Guardando…' })
    const err = await onSave(dish.id, patch)
    setStatus(err ? { ok: false, text: err } : { ok: true, text: 'Guardado ✓' })
  }
  const commit = () => {
    const patch: Partial<Dish> = {}
    if (name.trim() && name.trim() !== dish.name) patch.name = name.trim()
    const n = toNum(price)
    if (n !== dish.price) patch.price = n
    if (Object.keys(patch).length) void save(patch)
  }

  return (
    <div className={`mdd-row${dish.visible ? '' : ' is-off'}`}>
      <label className="mdd-sw">
        <input type="checkbox" checked={dish.visible} onChange={(e) => void save({ visible: e.target.checked })} aria-label={`Mostrar ${dish.name} hoy`} />
        Hoy
      </label>
      <div className="mdd-fields">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} aria-label="Nombre del plato" maxLength={120} />
        <input type="text" inputMode="numeric" value={price} onChange={(e) => setPrice(gs(toNum(e.target.value)))} onBlur={commit} aria-label="Precio en guaraníes" placeholder="Precio ₲" />
      </div>
      <div className="mdd-sub">
        <label>
          <input type="checkbox" checked={dish.soldOut} onChange={(e) => void save({ soldOut: e.target.checked })} /> Agotado
        </label>
        {cats.length > 1 && (
          <select
            className="mdd-copy"
            aria-label={`Copiar ${dish.name} a otra categoría`}
            value=""
            onChange={async (e) => {
              const v = e.target.value
              if (!v) return
              setStatus({ ok: true, text: 'Copiando…' })
              const err = await onCopy(dish, cats.find((c) => String(c.id) === v)?.id ?? v)
              setStatus(err ? { ok: false, text: err } : { ok: true, text: 'Copiado ✓' })
            }}
          >
            <option value="">Copiar a otro día…</option>
            {cats.filter((c) => c.id !== dish.categoryId).map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}</option>)}
          </select>
        )}
        {status && <span role="status" className={status.ok ? 'mdd-ok' : 'mdd-err'}>{status.text}</span>}
      </div>
    </div>
  )
}

export function MenuDelDiaClient(props: Props) {
  const { restaurantId, restaurantName, maxDishes, minToPublish, needsApproval, approved, published, menuUrl } = props
  const [dishes, setDishes] = useState<Dish[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [tagline, setTagline] = useState(props.tagline)
  const [tagStatus, setTagStatus] = useState('')
  const [pub, setPub] = useState<{ busy: boolean; text: string; ok: boolean; url?: string }>({ busy: false, text: '', ok: true })
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newCat, setNewCat] = useState('')
  const [addErr, setAddErr] = useState('')
  const [confirmHide, setConfirmHide] = useState(false)
  const dishesRef = useRef<Dish[]>([])
  dishesRef.current = dishes

  const load = useCallback(async () => {
    try {
      const tenant = `where[tenant][equals]=${encodeURIComponent(String(restaurantId))}`
      const [d, c] = await Promise.all([
        api(`/api/dishes?limit=300&depth=0&sort=_order&${tenant}`, 'GET'),
        api(`/api/categories?limit=100&depth=0&sort=_order&${tenant}`, 'GET'),
      ])
      const cl = ((c.docs as { id: number | string; name: string }[]) || []).map((x) => ({ id: x.id, name: x.name }))
      setCats(cl)
      setDishes(
        ((d.docs as Record<string, unknown>[]) || []).map((x) => ({
          id: x.id as number | string,
          name: String(x.name ?? ''),
          price: typeof x.price === 'number' ? x.price : null,
          visible: x.visible !== false,
          soldOut: x.soldOut === true,
          categoryId: (typeof x.category === 'object' && x.category ? (x.category as { id: number | string }).id : (x.category as number | string)) ?? null,
        })),
      )
      setNewCat((cur) => cur || String(cl[0]?.id ?? ''))
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'No pudimos cargar tus platos.')
    } finally {
      setLoading(false)
    }
  }, [restaurantId])

  useEffect(() => { void load() }, [load])

  // optimistic: the switch flips at once and goes back only if the server refuses the change
  const saveDish = useCallback(async (id: Dish['id'], patch: Partial<Dish>): Promise<string | null> => {
    const before = dishesRef.current.find((x) => x.id === id)
    setDishes((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    try {
      const body: Record<string, unknown> = {}
      if ('name' in patch) body.name = patch.name
      if ('price' in patch) body.price = patch.price
      if ('visible' in patch) body.visible = patch.visible
      if ('soldOut' in patch) body.soldOut = patch.soldOut
      await api(`/api/dishes/${id}`, 'PATCH', body)
      return null
    } catch (e) {
      if (before) setDishes((list) => list.map((x) => (x.id === id ? before : x)))
      return e instanceof Error ? e.message : 'No se pudo guardar.'
    }
  }, [])

  const grouped = useMemo(() => {
    const order = new Map(cats.map((c, i) => [String(c.id), i]))
    const by = new Map<string, Dish[]>()
    dishes.forEach((d) => { const k = String(d.categoryId ?? ''); by.set(k, [...(by.get(k) || []), d]) })
    return [...by.entries()].sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99)).map(([k, list]) => ({ cat: cats.find((c) => String(c.id) === k)?.name || 'Sin categoría', list }))
  }, [dishes, cats])

  const visibleWithPrice = dishes.filter((d) => d.visible && d.price != null && d.price > 0).length
  const atCap = maxDishes != null && dishes.length >= maxDishes
  const lowMsg = visibleWithPrice < minToPublish ? `Para publicar necesitás al menos ${minToPublish} platos visibles con precio (ahora hay ${visibleWithPrice}).` : ''
  const highMsg = maxDishes != null && visibleWithPrice > maxDishes ? `Tu plan permite hasta ${maxDishes} platos visibles (ahora hay ${visibleWithPrice}).` : ''

  const [dayMsg, setDayMsg] = useState('')
  const copyDish = async (d: Dish, catId: Category['id']): Promise<string | null> => {
    try {
      await api('/api/dishes', 'POST', { name: d.name, price: d.price, category: /^\d+$/.test(String(catId)) ? Number(catId) : catId, tenant: restaurantId, visible: true })
      await load()
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'No se pudo copiar.'
    }
  }
  // one tap: show only this category's dishes today (the typical comedor setup is one category per weekday)
  const showOnly = async (cat: Category) => {
    setDayMsg(`Armando el menú de ${cat.name}…`)
    for (const d of dishes) {
      const want = d.categoryId === cat.id
      if (d.visible !== want) {
        const err = await saveDish(d.id, { visible: want })
        if (err) return setDayMsg(err)
      }
    }
    setDayMsg(`Listo: hoy se muestra solo ${cat.name}. Tocá «Publicar menú de hoy».`)
  }
  const createWeek = async () => {
    setDayMsg('Creando Lunes a Viernes…')
    try {
      const have = new Set(cats.map((c) => norm(c.name)))
      for (const name of WEEK) if (!have.has(norm(name))) await api('/api/categories', 'POST', { name, tenant: restaurantId })
      await load()
      setDayMsg('Listo: ya tenés una categoría por día. Agregá los platos de cada día abajo.')
    } catch (e) {
      setDayMsg(e instanceof Error ? e.message : 'No se pudo crear las categorías.')
    }
  }
  const addDish = async () => {
    setAddErr('')
    if (newName.trim().length < 2) return setAddErr('Escribí el nombre del plato.')
    if (!newCat) return setAddErr('Elegí una categoría.')
    try {
      const res = await api('/api/dishes', 'POST', { name: newName.trim(), price: toNum(newPrice), category: /^\d+$/.test(newCat) ? Number(newCat) : newCat, tenant: restaurantId, visible: true })
      void res
      setNewName(''); setNewPrice('')
      await load()
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : 'No se pudo agregar el plato.')
    }
  }

  const saveTagline = async () => {
    setTagStatus('Guardando…')
    try { await api(`/api/restaurants/${restaurantId}`, 'PATCH', { tagline: tagline.trim() }); setTagStatus('Guardado ✓') }
    catch (e) { setTagStatus(e instanceof Error ? e.message : 'No se pudo guardar.') }
  }

  const hideAll = async () => {
    setConfirmHide(false)
    for (const d of dishes.filter((x) => x.visible)) await saveDish(d.id, { visible: false })
  }

  const publish = async () => {
    setPub({ busy: true, text: '', ok: true })
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/publish`, { method: 'POST', credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as { message?: string; menuUrl?: string; pending?: boolean }
      setPub({ busy: false, ok: res.ok, text: j.message || (res.ok ? 'Listo, tu menú se está publicando.' : `Error ${res.status}`), url: j.menuUrl })
    } catch {
      setPub({ busy: false, ok: false, text: 'No se pudo conectar. Revisá tu internet y volvé a intentar.' })
    }
  }

  return (
    <div className="mdd">
      <style>{CSS}</style>
      <div>
        <h1>Menú del día</h1>
        <p className="mdd-muted">{restaurantName}: elegí qué platos mostrás hoy, cambiá nombres y precios, y publicá. Tus clientes ven el cambio en 1 a 2 minutos con el mismo link de siempre.</p>
        {menuUrl && <p><a href={menuUrl} target="_blank" rel="noreferrer">Ver mi menú en línea</a></p>}
      </div>

      <div className="mdd-card">
        <strong>Aviso de hoy para tus clientes</strong>
        <span className="mdd-muted">Se ve debajo de tu logo. Ejemplo: «Pedidos hasta las 10:00 · Delivery ₲ 2.000 por plato».</span>
        <input type="text" value={tagline} maxLength={140} onChange={(e) => setTagline(e.target.value)} onBlur={saveTagline} aria-label="Aviso de hoy" placeholder="Pedidos hasta las 10:00" />
        {tagStatus && <span role="status" className={tagStatus.endsWith('✓') ? 'mdd-ok' : 'mdd-err'}>{tagStatus}</span>}
      </div>

      {loading && <p role="status">Cargando tus platos…</p>}
      {loadErr && <p role="alert" className="mdd-err">{loadErr}</p>}

      {!loading && !loadErr && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="mdd-muted"><strong>{visibleWithPrice}</strong> platos visibles hoy{maxDishes != null ? ` · ${dishes.length} de ${maxDishes} cargados (plan Gratis)` : ''}</span>
            {dishes.some((d) => d.visible) && (confirmHide ? (
              <>
                <button type="button" className="mdd-btn" onClick={hideAll}>Sí, ocultar todos</button>
                <button type="button" className="mdd-btn" onClick={() => setConfirmHide(false)}>Cancelar</button>
              </>
            ) : (
              <button type="button" className="mdd-btn" onClick={() => setConfirmHide(true)}>Ocultar todos para armar el menú de hoy</button>
            ))}
          </div>

          <div className="mdd-card">
            <strong>Menú por día</strong>
            {cats.length > 1 ? (
              <>
                <span className="mdd-muted">Tocá un día para mostrar solo sus platos hoy. Después publicá.</span>
                <div className="mdd-chips">
                  {cats.map((c) => (
                    <button key={String(c.id)} type="button" className={`mdd-chip${norm(c.name) === todayName() ? ' is-today' : ''}`} onClick={() => void showOnly(c)}>
                      {c.name}
                      {norm(c.name) === todayName() && <small>hoy</small>}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <span className="mdd-muted">Si tu menú cambia por día, creá una categoría por día y alterná entre ellas con un toque.</span>
            )}
            {WEEK.some((w) => !cats.some((c) => norm(c.name) === norm(w))) && (
              <div><button type="button" className="mdd-btn" onClick={createWeek}>Crear categorías de Lunes a Viernes</button></div>
            )}
            {dayMsg && <span role="status" className={dayMsg.startsWith('Listo') || dayMsg.endsWith('…') ? 'mdd-ok' : 'mdd-err'}>{dayMsg}</span>}
          </div>

          {dishes.length === 0 && <p className="mdd-card">Todavía no cargaste platos. Agregá el primero acá abajo.</p>}
          {grouped.map((g) => (
            <section key={g.cat} aria-label={g.cat} style={{ display: 'grid', gap: 10 }}>
              <p className="mdd-cat">{g.cat}</p>
              {g.list.map((d) => <DishRow key={d.id} dish={d} cats={cats} onSave={saveDish} onCopy={copyDish} />)}
            </section>
          ))}

          <div className="mdd-card mdd-add">
            <strong>Agregar un plato</strong>
            {atCap ? (
              <p className="mdd-muted">Llegaste al máximo de {maxDishes} platos del plan Gratis. Para cambiar el menú de hoy, editá el nombre y el precio de un plato de arriba.</p>
            ) : cats.length === 0 ? (
              <p className="mdd-muted">Primero creá una categoría (por ejemplo «Platos del día»): <a href="/admin/collections/categories/create">crear categoría</a>.</p>
            ) : (
              <>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre del plato" aria-label="Nombre del plato nuevo" maxLength={120} />
                <div className="mdd-fields">
                  <select value={newCat} onChange={(e) => setNewCat(e.target.value)} aria-label="Categoría">
                    {cats.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}</option>)}
                  </select>
                  <input type="text" inputMode="numeric" value={newPrice} onChange={(e) => setNewPrice(gs(toNum(e.target.value)))} placeholder="Precio ₲" aria-label="Precio del plato nuevo" />
                </div>
                <div><button type="button" className="mdd-btn" onClick={addDish}>Agregar plato</button></div>
                {addErr && <span role="alert" className="mdd-err">{addErr}</span>}
              </>
            )}
          </div>
        </>
      )}

      <div className="mdd-bar">
        <div className="mdd-bar__in">
          <span className="mdd-muted">
            {lowMsg || highMsg || `${visibleWithPrice} platos listos para publicar`}
            {needsApproval && !approved && !published ? ' · La primera publicación la revisamos antes de que salga.' : ''}
          </span>
          <button type="button" className="mdd-btn mdd-btn--main" onClick={publish} disabled={pub.busy || Boolean(highMsg)}>
            {pub.busy ? 'Publicando…' : 'Publicar menú de hoy'}
          </button>
        </div>
        {pub.text && (
          <span role="status" className={pub.ok ? 'mdd-ok' : 'mdd-err'} style={{ fontSize: 13 }}>
            {pub.text} {pub.url && <a href={pub.url} target="_blank" rel="noreferrer">Ver el menú</a>}
          </span>
        )}
      </div>
    </div>
  )
}
