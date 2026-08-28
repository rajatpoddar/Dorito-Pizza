import { Link } from 'react-router-dom'
import { useCart } from '../../context/CartContext'
import { fmtINR } from '../../constants'

export default function CartPage() {
  const { items, updateQty, removeItem, clear, total } = useCart()

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-5xl">🛒</p>
        <h1 className="mt-4 font-display text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Add some tasty items from our menu to get started.
        </p>
        <Link to="/" className="btn-primary mt-6">
          Browse Menu
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Your Cart</h1>
        <button onClick={clear} className="text-sm text-red-500 hover:underline">
          Clear all
        </button>
      </div>

      <div className="card divide-y divide-neutral-100">
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{i.name}</p>
              <p className="text-sm text-neutral-500">{fmtINR(i.price)} each</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateQty(i.id, i.quantity - 1)}
                className="h-8 w-8 rounded-md border border-neutral-300 font-bold hover:bg-neutral-100"
              >
                −
              </button>
              <span className="w-7 text-center font-semibold">{i.quantity}</span>
              <button
                onClick={() => updateQty(i.id, i.quantity + 1)}
                className="h-8 w-8 rounded-md border border-neutral-300 font-bold hover:bg-neutral-100"
              >
                +
              </button>
            </div>
            <div className="w-20 text-right font-bold">{fmtINR(i.price * i.quantity)}</div>
            <button
              onClick={() => removeItem(i.id)}
              className="text-neutral-400 transition hover:text-red-500"
              aria-label={`Remove ${i.name}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="card mt-4 space-y-2 p-4">
        <div className="flex justify-between text-sm text-neutral-600">
          <span>Subtotal</span>
          <span>{fmtINR(total)}</span>
        </div>
        <div className="flex justify-between text-sm text-neutral-600">
          <span>Delivery</span>
          <span className="font-semibold text-green-600">Free</span>
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-bold">
          <span>Total</span>
          <span>{fmtINR(total)}</span>
        </div>
        <Link to="/checkout" className="btn-primary mt-2 w-full">
          Proceed to Checkout →
        </Link>
      </div>
    </main>
  )
}
