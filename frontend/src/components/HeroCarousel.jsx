import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtINR, HERO_FALLBACK_SLIDES, heroImageFor } from '../constants'
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

const TAGS = ['🔥 Best Seller', '⭐ Chef Special', '🌽 Sweet & Savory', '🌱 Crunchy Bite']


/** Auto-playing hero carousel driven by db items (falls back to placeholder).
 *  Props:
 *    items  – array of menu items (with image_url) to use as slides
 *    onAdd  – callback(item) when the "Add" CTA on a slide is clicked
 *
 *  Image policy (see constants.js#heroImageFor):
 *    - 1st: HERO_IMAGES[name]   → /assets/hero/<file>.png (curated marketing)
 *    - 2nd: item.image_url       → /assets/menu/<file>.png  (DB-driven)
 *    - 3rd: category-based best-effort
 *    - 4th: HERO_FALLBACK_SLIDES (only when items=[])
 *
 *  Note: HERO_IMAGES wins over item.image_url on purpose. The /assets/menu
 *  PNGs are opaque item photos for the menu grid; the /assets/hero PNGs
 *  are the curated slides the shop owner wants on the home page. Honouring
 *  item.image_url first would cause a silent regression to the old
 *  thumbnail on any item that has a DB image set.
 *
 *  Mobile: image is ALWAYS visible (previously `hidden sm:block`).
 */
export default function HeroCarousel({ items = [], onAdd }) {
  const { count } = useCart()
  const slides = items.length > 0
    ? items.slice(0, 4).map((it, i) => ({
        id: it.id,
        img: heroImageFor(it),
        eyebrow: TAGS[i] || '✨ Featured',
        title: it.name,
        subtitle: it.description || `Just ${fmtINR(it.price)} · Order now`,
        bg: CAT_GRADIENT[it.category_name] || DEFAULT_GRADIENT,
        price: it.price,
      }))
    : HERO_FALLBACK_SLIDES

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
    return null
  }

  return (
    <section
      className="group relative overflow-hidden rounded-2xl bg-brand-dark shadow-pop sm:rounded-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* slides — taller on desktop; always show image now */}
      <div
        className="relative h-56 sm:h-80 lg:h-[28rem]"
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

            {/* transparent-PNG-friendly image:
                - object-contain so nothing is cropped
                - drop-shadow so transparent PNGs read against any gradient
                - ALWAYS visible (mobile → desktop) */}
            {s.img && (
              <img
                src={s.img}
                alt={s.title}
                loading={i === 0 ? 'eager' : 'lazy'}
                draggable="false"
                className="absolute right-2 top-1/2 h-44 w-auto -translate-y-1/2 object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)] sm:right-4 sm:h-64 md:right-10 md:h-72 lg:right-14 lg:h-[22rem]"
                onError={(e) => {
                  // Image failed to load — try the next-best source before
                  // giving up. Order: item.image_url → category fallback →
                  // hide. This way a broken /assets/hero/*.png still
                  // shows the menu photo instead of a blank hero.
                  const el = e.currentTarget
                  const item = items[i]
                  if (el.dataset.fallbackStep === undefined) el.dataset.fallbackStep = '0'
                  let step = parseInt(el.dataset.fallbackStep, 10)
                  step += 1
                  el.dataset.fallbackStep = String(step)
                  if (step === 1 && item && item.image_url && el.src !== item.image_url) {
                    el.src = item.image_url
                  } else {
                    el.style.display = 'none'
                  }
                }}
              />
            )}
            <div className="relative z-10 flex h-full flex-col justify-center px-4 sm:px-8 md:px-12 lg:px-14"
                 style={{ maxWidth: '62%' }}>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur-md ring-1 ring-white/30 sm:px-3 sm:py-1">
                {s.eyebrow}
              </span>
              <h1 className="mt-2 max-w-md font-display text-xl font-black leading-[1.05] text-white drop-shadow-lg sm:mt-3 sm:text-3xl md:text-4xl lg:text-5xl">
                {s.title}
              </h1>
              <p className="mt-1 hidden max-w-md text-sm font-medium text-white/90 drop-shadow sm:mt-2 sm:block sm:text-base lg:text-lg">
                {s.subtitle}
              </p>
              {s.price != null && (
                <p className="mt-2 font-display text-lg font-extrabold text-white drop-shadow sm:mt-2 sm:text-2xl md:text-3xl">
                  {fmtINR(s.price)}
                </p>
              )}
              {/* Only 2 buttons: Add + View Cart */}
              <div className="mt-3 flex flex-wrap gap-2 sm:mt-5">
                {onAdd && (
                  <button
                    onClick={() => onAdd(items[i] || s)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold px-3 py-1.5 text-xs font-bold text-brand-dark shadow-lg transition hover:scale-105 hover:shadow-xl sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm"
                  >
                    + Add
                  </button>
                )}
                <Link
                  to="/cart"
                  className="relative inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-red shadow-lg transition hover:scale-105 hover:shadow-xl sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm"
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

      {/* Free delivery badge — always visible (top-right), sized to mobile */}
      <span className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-full bg-brand-dark/90 px-2 py-1 text-[10px] font-bold text-brand-gold shadow-lg ring-1 ring-brand-gold/30 backdrop-blur sm:right-3 sm:top-3 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-[11px]">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400 sm:h-2 sm:w-2" />
        Free delivery over ₹500
      </span>
    </section>
  )
}

