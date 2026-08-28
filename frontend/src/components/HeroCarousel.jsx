import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtINR } from '../constants'
import { useCart } from '../context/CartContext'

/* Gradient backdrops per category — used when item is db-driven. */
const CAT_GRADIENT = {
  Pizza:           'from-rose-600 via-red-500 to-amber-400',
  Burger:          'from-amber-500 via-orange-500 to-red-500',
  'Cake and Pasty':'from-pink-500 via-rose-400 to-amber-300',
  'Chicken Item':  'from-orange-600 via-red-600 to-rose-500',
  'Coffee and Shake':'from-amber-700 via-yellow-600 to-orange-500',
  'Pasta and Roll':'from-emerald-600 via-teal-500 to-amber-400',
}
const DEFAULT_GRADIENT = 'from-rose-600 via-red-500 to-amber-400'

const TAGS = ['🔥 Best Seller', '🍔 New Arrival', '🎂 Freshly Baked', '🍝 Combo Deal']


/** Auto-playing hero carousel driven by db items (falls back to placeholder).
 *  Props:
 *    items  – array of menu items (with image_url) to use as slides
 *    onAdd  – callback(item) when the "Add" CTA on a slide is clicked
 */
export default function HeroCarousel({ items = [], onAdd }) {
  const { count } = useCart()
  const slides = items.length > 0
    ? items.slice(0, 4).map((it, i) => ({
        id: it.id,
        img: it.image_url,
        eyebrow: TAGS[i] || '✨ Featured',
        title: it.name,
        subtitle: it.description || `Just ${fmtINR(it.price)} · Order now`,
        bg: CAT_GRADIENT[it.category_name] || DEFAULT_GRADIENT,
        price: it.price,
      }))
    : []

  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const total = slides.length || 1

  useEffect(() => {
    if (paused || total < 2) return
    const t = setInterval(() => setIdx((i) => (i + 1) % total), 4500)
    return () => clearInterval(t)
  }, [paused, total])

  const touch = { x: null }
  const onTouchStart = (e) => { touch.x = e.touches[0].clientX; setPaused(true) }
  const onTouchEnd = (e) => {
    if (touch.x === null) return
    const dx = e.changedTouches[0].clientX - touch.x
    if (Math.abs(dx) > 40) setIdx((i) => (i + (dx < 0 ? 1 : -1) + total) % total)
    touch.x = null
    setPaused(false)
  }

  if (slides.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-amber-400 text-white sm:h-72 lg:h-[30rem]">
        <div className="text-center">
          <p className="text-4xl">🍕</p>
          <p className="mt-2 font-display text-xl font-bold sm:text-2xl">Dorito Pizza & Bakery</p>
          <p className="mt-1 text-xs sm:text-sm">Loading menu…</p>
        </div>
      </div>
    )
  }

  return (
    <section
      className="group relative overflow-hidden rounded-2xl bg-brand-dark shadow-pop sm:rounded-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* slides — mobile h-52 (208px) / sm h-72 / lg 30rem */}
      <div
        className="relative h-52 sm:h-72 lg:h-[30rem]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {slides.map((s, i) => (
          <div
            key={s.id}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === idx ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${s.bg} opacity-95`} />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.18),transparent_50%)]" />
            <div className="absolute -bottom-12 right-1/4 h-40 w-40 rounded-full bg-white/10 blur-3xl sm:-bottom-16 sm:h-56 sm:w-56" />
            <div className="absolute -bottom-16 left-1/3 h-56 w-56 rounded-full bg-brand-gold/20 blur-3xl" />
            {s.img && (
              <img
                src={s.img}
                alt={s.title}
                loading={i === 0 ? 'eager' : 'lazy'}
                className="absolute right-0 top-1/2 hidden h-[112%] w-auto -translate-y-1/2 object-contain drop-shadow-[0_25px_50px_rgba(0,0,0,0.45)] sm:block sm:w-1/2 lg:w-[55%]"
                style={{
                  maskImage: 'linear-gradient(to left, black 70%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to left, black 70%, transparent 100%)',
                }}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
            <div className="relative z-10 flex h-full flex-col justify-center px-5 sm:px-10 lg:px-14">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur-md ring-1 ring-white/30 sm:px-3 sm:py-1">
                {s.eyebrow}
              </span>
              <h1 className="mt-2 max-w-md font-display text-2xl font-black leading-[1.05] text-white drop-shadow-lg sm:mt-3 sm:text-4xl lg:text-6xl">
                {s.title}
              </h1>
              <p className="mt-1.5 hidden max-w-md text-sm font-medium text-white/90 drop-shadow sm:mt-2 sm:block sm:text-base lg:text-lg">
                {s.subtitle}
              </p>
              {s.price != null && (
                <p className="mt-2 font-display text-xl font-extrabold text-white drop-shadow sm:mt-2 sm:text-3xl">
                  {fmtINR(s.price)}
                </p>
              )}
              {/* Only 2 buttons: Add + View Cart */}
              <div className="mt-4 flex flex-wrap gap-2 sm:mt-5">
                {onAdd && (
                  <button
                    onClick={() => onAdd(items[i])}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold px-3.5 py-2 text-xs font-bold text-brand-dark shadow-lg transition hover:scale-105 hover:shadow-xl sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm"
                  >
                    + Add
                  </button>
                )}
                <Link
                  to="/cart"
                  className="relative inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-bold text-brand-red shadow-lg transition hover:scale-105 hover:shadow-xl sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm"
                >
                  <span>🛒 View Cart</span>
                  {count > 0 && (
                    <span
                      aria-label={`${count} item in cart`}
                      className="ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-red px-1.5 text-[11px] font-bold text-white"
                    >
                      {count}
                    </span>
                  )}
                </Link>
              </div>
              {/* Quick tags — only on lg+ (desktop) to avoid mobile overlap */}
              <div className="mt-3 hidden flex-wrap items-center gap-2 text-[11px] font-semibold text-white/85 lg:flex">
                <span className="rounded-full bg-black/20 px-2.5 py-1 backdrop-blur">⚡ 30 min</span>
                <span className="rounded-full bg-black/20 px-2.5 py-1 backdrop-blur">💰 COD + UPI</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {total > 1 && (
        <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 gap-1.5 sm:bottom-3">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === idx ? 'w-6 bg-white shadow' : 'w-1.5 bg-white/50 hover:bg-white/75'
              }`}
            />
          ))}
        </div>
      )}

      {/* Free delivery badge — only on sm+ to avoid overlap on mobile */}
      <span className="absolute right-3 top-3 z-20 hidden items-center gap-1.5 rounded-full bg-brand-dark/90 px-3 py-1.5 text-[11px] font-bold text-brand-gold shadow-lg ring-1 ring-brand-gold/30 backdrop-blur sm:inline-flex">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
        Free delivery over ₹500
      </span>
    </section>
  )
}

