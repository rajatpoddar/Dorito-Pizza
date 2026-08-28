import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import { useCart } from '../../context/CartContext'
import { fmtINR, CATEGORY_EMOJI } from '../../constants'
import MenuItemCard from '../../components/MenuItemCard'
import HeroCarousel from '../../components/HeroCarousel'

const CAT_PILL_COLORS = {
  'Pizza':           'from-red-500 to-orange-500',
  'Burger':          'from-amber-500 to-yellow-500',
  'Cake and Pasty':  'from-pink-500 to-rose-500',
  'Chicken Item':    'from-orange-600 to-red-600',
  'Coffee and Shake':'from-amber-700 to-yellow-600',
  'Pasta and Roll':  'from-emerald-500 to-green-500',
}

export default function MenuPage() {
  const { addItem } = useCart()
  const [categories, setCategories] = useState([])
  const [offers, setOffers] = useState([])
  const [shop, setShop] = useState(null)
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState(null)
  const sectionRefs = useRef({})

  useEffect(() => {
    let alive = true
    Promise.all([
      api.get('/menu/categories').catch(() => ({ data: { categories: [] } })),
      api.get('/offers').catch(() => ({ data: { offers: [] } })),
      api.get('/settings').catch(() => ({ data: {} })),
    ]).then(([c, o, s]) => {
      if (!alive) return
      setCategories(c.data.categories || [])
      setOffers((o.data.offers || []).slice(0, 4))
      setShop(s.data || null)
    })
    return () => { alive = false }
  }, [])

  const allItems = useMemo(
    () => categories.flatMap((c) => (c.items || []).map((i) => ({ ...i, category_name: c.name }))),
    [categories],
  )
  const bestsellers = useMemo(() => {
    const special = allItems.find((i) => i.name === 'Dorito Special Pizza')
    const rest = allItems.filter((i) => i !== special).slice(0, 4)
    return special ? [special, ...rest] : rest.slice(0, 4)
  }, [allItems])

  const visibleCategories = useMemo(() => {
    if (!search.trim()) return categories
    const q = search.toLowerCase()
    return categories
      .map((c) => ({ ...c, items: (c.items || []).filter((i) => i.name.toLowerCase().includes(q)) }))
      .filter((c) => c.items.length > 0)
  }, [categories, search])

  const scrollToCategory = (id) => {
    setActiveCat(id)
    const el = sectionRefs.current[id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="bg-gradient-to-b from-amber-50/30 to-white">
      {/* ═══════════ HERO (db-driven slides) ═══════════ */}
      <section className="px-4 pb-4 pt-2">
        <HeroCarousel items={bestsellers} onAdd={addItem} />
      </section>

      {/* ═══════════ SHOP STATUS (no address) ═══════════ */}
      {shop && (
        <section className="mx-auto mb-4 flex max-w-6xl items-center justify-center gap-3 px-4 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            {shop.is_open_now ? 'Open Now' : 'Closed'}
          </span>
          <span className="text-neutral-400">·</span>
          <span className="font-medium text-neutral-600">
            ⏱ {shop.avg_delivery_minutes || 30} min delivery
          </span>
          <span className="text-neutral-400">·</span>
          <a
            href={`tel:${shop.phone_primary}`}
            className="font-semibold text-brand-red hover:underline"
          >
            📞 Call to Order
          </a>
        </section>
      )}

      {/* ═══════════ BIG OFFERS BANNER (latest) ═══════════ */}
      {offers.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-4">
          <div className="mb-2 flex items-end justify-between">
            <h2 className="font-display text-xl font-bold text-brand-dark">
              🎁 Latest Offers
            </h2>
            <span className="text-xs text-neutral-500">Limited time · auto-applied at checkout</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {offers.map((o) => (
              <Link
                key={o.code}
                to="/cart"
                className="group relative overflow-hidden rounded-2xl border-2 border-dashed border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-3 transition hover:scale-[1.02] hover:shadow-lg"
              >
                <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-amber-200/50 transition group-hover:scale-125"></div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Use Code
                </p>
                <p className="mt-1 font-mono text-lg font-extrabold text-brand-dark">
                  {o.code}
                </p>
                <p className="mt-1 text-sm font-bold text-amber-800">
                  {o.amount_label}
                </p>
                {o.title && (
                  <p className="mt-0.5 truncate text-[11px] text-neutral-600">{o.title}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ═══════════ WHY DORITO ═══════════ */}
      <section className="mx-auto max-w-6xl px-4 pb-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-neutral-100 sm:grid-cols-4">
          <Benefit icon="🚀" title="30 min" sub="Fast delivery" />
          <Benefit icon="🔥" title="Fresh" sub="Made to order" />
          <Benefit icon="💰" title="Best Price" sub="No hidden fees" />
          <Benefit icon="⭐" title="4.8 / 5" sub="Customer rating" />
        </div>
      </section>

      {/* ═══════════ CATEGORY PILLS (sticky) ═══════════ */}
      <section className="sticky top-[64px] z-20 -mx-4 border-b border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur sm:top-[72px]">
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto pb-1">
          <Pill
            active={activeCat === null}
            onClick={() => { setActiveCat(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            icon="🍽️"
            label="All"
            color="from-brand-red to-red-600"
          />
          {categories.map((c) => (
            <Pill
              key={c.id}
              active={activeCat === c.id}
              onClick={() => scrollToCategory(c.id)}
              icon={CATEGORY_EMOJI[c.name] || '🍴'}
              label={c.name}
              color={CAT_PILL_COLORS[c.name] || 'from-neutral-700 to-neutral-900'}
            />
          ))}
        </div>
      </section>

      {/* ═══════════ BESTSELLERS (horizontal scroll) ═══════════ */}
      {bestsellers.length > 0 && !search && (
        <section className="mx-auto max-w-6xl px-4 pb-4 pt-2">
          <div className="mb-2 flex items-end justify-between">
            <h2 className="font-display text-xl font-bold text-brand-dark">
              🔥 Bestsellers
            </h2>
            <span className="text-xs text-neutral-500">Most loved by customers</span>
          </div>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory">
            {bestsellers.map((item) => (
              <div
                key={item.id}
                className="w-56 flex-shrink-0 snap-start rounded-2xl bg-white p-3 shadow-sm ring-1 ring-neutral-100"
              >
                <MenuItemCard item={item} onAdd={addItem} compact />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══════════ SEARCH ═══════════ */}
      <section className="mx-auto max-w-6xl px-4 pb-3">
        <div className="relative">
          <input
            className="input w-full pl-10"
            placeholder="Search pizza, burger, cake…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">🔍</span>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-200"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* ═══════════ ALL CATEGORIES ═══════════ */}
      <section className="mx-auto max-w-6xl px-4 pb-12">
        {visibleCategories.length === 0 ? (
          <div className="py-20 text-center text-neutral-500">
            <p className="text-5xl">🔍</p>
            <p className="mt-3">No items match "{search}"</p>
          </div>
        ) : (
          visibleCategories.map((cat) => (
            <div
              key={cat.id}
              ref={(el) => (sectionRefs.current[cat.id] = el)}
              className="mb-8 scroll-mt-32"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl">{CATEGORY_EMOJI[cat.name] || '🍴'}</span>
                <h2 className="font-display text-2xl font-bold text-brand-dark">
                  {cat.name}
                </h2>
                <span className="text-xs text-neutral-500">
                  · {cat.items.length} item{cat.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {cat.items.map((item) => (
                  <MenuItemCard key={item.id} item={item} onAdd={addItem} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  )
}

function Benefit({ icon, title, sub }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-sm font-bold text-brand-dark">{title}</p>
        <p className="text-[11px] text-neutral-500">{sub}</p>
      </div>
    </div>
  )
}

function Pill({ active, onClick, icon, label, color }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? `border-transparent bg-gradient-to-r ${color} text-white shadow-md`
          : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
      }`}
    >
      <span className="text-sm">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

