import { useState } from 'react'
import { useCart } from '../context/CartContext'
import { fmtINR } from '../constants'

export default function ComboPackCard({ combo }) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)
  const [showItems, setShowItems] = useState(false)

  if (!combo || !combo.is_available) return null

  const handleAdd = () => {
    // Add each combo item individually to the cart
    for (const ci of combo.items) {
      addItem({ id: ci.menu_item_id, name: ci.item_name, price: ci.item_price }, ci.quantity)
    }
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div className="card overflow-hidden p-0 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-pop">
      {/* Gradient header */}
      <div className="relative bg-gradient-to-r from-brand-red to-orange-500 px-4 py-3">
        <span className="absolute right-3 top-2 rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-900 shadow">
          Combo Deal
        </span>
        <h3 className="pr-20 text-base font-bold text-white">{combo.name}</h3>
        {combo.description && (
          <p className="mt-0.5 text-xs text-white/80">{combo.description}</p>
        )}
      </div>

      <div className="p-3.5">
        {/* Savings badge */}
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
            Save {fmtINR(combo.savings)}
          </span>
          <span className="text-xs text-neutral-400 line-through">
            {fmtINR(combo.original_total)}
          </span>
          <span className="ml-auto text-lg font-extrabold text-brand-red">
            {fmtINR(combo.combo_price)}
          </span>
        </div>

        {/* Items preview */}
        <button
          onClick={() => setShowItems(!showItems)}
          className="mb-3 w-full text-left text-xs font-medium text-neutral-500 hover:text-brand-red"
        >
          {showItems ? '▾ Hide items' : `▸ ${combo.items.length} items included`}
        </button>

        {showItems && (
          <div className="mb-3 space-y-1.5 rounded-lg bg-neutral-50 p-2.5">
            {combo.items.map((ci, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="text-neutral-700">
                  {ci.item_name} × {ci.quantity}
                </span>
                <span className="text-neutral-400">{fmtINR(ci.item_price)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Add button */}
        <button
          onClick={handleAdd}
          className={`w-full rounded-xl py-2.5 text-sm font-bold transition-all ${
            added
              ? '!bg-green-600 text-white shadow-[0_0_0_4px_rgba(34,197,94,0.18)]'
              : 'bg-brand-red text-white hover:bg-brand-red-dark active:scale-[0.98]'
          }`}
        >
          {added ? '✓ Added to Cart' : `Add Combo — ${fmtINR(combo.combo_price)}`}
        </button>
      </div>
    </div>
  )
}
