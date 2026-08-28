import { useState } from 'react'
import { useCart } from '../context/CartContext'
import { fmtINR, itemImage } from '../constants'

export default function MenuItemCard({ item, onAdd, compact = false }) {
  const cart = useCart()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const soldOut = !item.is_available

  const handleAdd = () => {
    const fn = onAdd || cart.addItem
    fn(item, qty)
    setQty(1)
    setAdded(true)
    setTimeout(() => setAdded(false), 1200)
  }

  return (
    <div
      className={`card overflow-hidden p-0 transition-all duration-300 ${
        soldOut ? 'opacity-60' : 'hover:-translate-y-0.5 hover:shadow-pop'
      }`}
    >
      {/* Image — fixed aspect ratio, no zoom on hover (image stays static;
          only the card lifts). Gradient bg fills transparent PNG edges. */}
      <div
        className={`relative w-full overflow-hidden bg-gradient-to-br from-amber-50 via-white to-rose-50 ${
          compact ? 'h-28' : 'h-36 sm:h-40'
        }`}
      >
        <img
          src={itemImage(item)}
          alt={item.name}
          loading="lazy"
          className="h-full w-full object-contain p-2"
          onError={(e) => { e.currentTarget.src = '/assets/menu/placeholder.png' }}
        />
        {soldOut && (
          <span className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
            Sold out
          </span>
        )}
      </div>
      <div className="p-3 sm:p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-neutral-900">
              {item.name}
            </h3>
            {item.description && (
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-neutral-500 sm:text-xs">
                {item.description}
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-md bg-brand-dark px-1.5 py-0.5 text-[11px] font-bold text-brand-gold sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-sm">
            {fmtINR(item.price)}
          </span>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-1.5 sm:mt-3">
          {soldOut ? (
            <span className="text-xs font-semibold uppercase tracking-wide text-red-500">
              Not available
            </span>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-7 w-7 rounded-md border border-neutral-300 text-sm font-bold transition hover:border-brand-red hover:bg-red-50 hover:text-brand-red"
                aria-label="decrease quantity"
              >
                −
              </button>
              <span className="w-5 text-center text-sm font-semibold tabular-nums">{qty}</span>
              <button
                onClick={() => setQty((q) => Math.min(20, q + 1))}
                className="h-7 w-7 rounded-md border border-neutral-300 text-sm font-bold transition hover:border-brand-red hover:bg-red-50 hover:text-brand-red"
                aria-label="increase quantity"
              >
                +
              </button>
            </div>
          )}
          <button
            disabled={soldOut}
            onClick={handleAdd}
            aria-label="Add to cart"
            className={`btn-primary !px-2.5 !py-1.5 text-xs transition-all sm:!px-3 ${
              added ? '!bg-green-600 shadow-[0_0_0_4px_rgba(34,197,94,0.18)]' : ''
            }`}
          >
            {added ? '✓ Added' : 'Add +'}
          </button>
        </div>
      </div>
    </div>
  )
}
