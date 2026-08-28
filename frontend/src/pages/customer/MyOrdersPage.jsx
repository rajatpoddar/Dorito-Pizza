import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errMessage } from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import { fmtINR, fmtTime } from '../../constants'

export default function MyOrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/orders/my')
      .then((res) => setOrders(res.data.orders))
      .catch((e) => setError(errMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-neutral-500">Loading your orders…</main>
  if (error) return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-red-500">{error}</main>

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <h1 className="mb-4 font-display text-2xl font-bold">My Orders</h1>

      {orders.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-5xl">📭</p>
          <p className="mt-4 text-neutral-500">No orders yet — time to try our special pizza!</p>
          <Link to="/" className="btn-primary mt-6">Browse Menu</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              to={`/track/${o.id}`}
              state={{ phone: o.customer_phone }}
              className="card block p-4 transition hover:border-brand-red"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-brand-dark">{o.order_number}</p>
                  <p className="text-xs text-neutral-500">{fmtTime(o.created_at)}</p>
                </div>
                <StatusBadge status={o.status} />
              </div>
              <p className="mt-2 truncate text-sm text-neutral-600">
                {o.items.map((i) => `${i.item_name} ×${i.quantity}`).join(', ')}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-neutral-400">
                  {o.payment_mode === 'cod' ? '💵 Cash on Delivery' : '📱 UPI'} · {o.payment_status}
                </span>
                <span className="font-bold">{fmtINR(o.total_amount)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
