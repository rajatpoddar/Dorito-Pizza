import { useCallback, useEffect, useRef, useState } from 'react'
import api, { errMessage } from '../../api/client'
import { usePolling } from '../../hooks'
import { fmtINR, fmtTime } from '../../constants'

const POLL_MS = 4000

// ── notification sound ──
const KITCHEN_AUDIO = typeof Audio !== 'undefined' ? new Audio('/sounds/04_kitchen_new_order.mp3') : null

function playKitchenSound() {
  if (KITCHEN_AUDIO) {
    KITCHEN_AUDIO.currentTime = 0
    KITCHEN_AUDIO.play().catch(() => {})
  }
}

const COLUMN_DEFS = [
  { key: 'pending', title: '🔥 New Orders', tone: 'border-amber-300', bg: 'bg-amber-50', action: 'Start Preparing', next: 'preparing', toneBtn: 'bg-amber-500 hover:bg-amber-600' },
  { key: 'preparing', title: '👨‍🍳 Preparing', tone: 'border-blue-300', bg: 'bg-blue-50', action: 'Mark Ready', next: 'ready', toneBtn: 'bg-blue-500 hover:bg-blue-600' },
  { key: 'ready', title: '✅ Ready for Delivery', tone: 'border-green-300', bg: 'bg-green-50', action: null, next: null, toneBtn: '' },
]

export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const prevOrderIdsRef = useRef(new Set())
  const isFirstLoadRef = useRef(true)

  const load = useCallback(
    () =>
      api
        .get('/kitchen/orders')
        .then((r) => {
          const newOrders = r.data.orders
          const newIds = new Set(newOrders.map(o => o.id))

          // Detect NEW pending orders (sound alert)
          if (!isFirstLoadRef.current) {
            const prevIds = prevOrderIdsRef.current
            const freshOrders = newOrders.filter(o => o.status === 'pending' && !prevIds.has(o.id))
            if (freshOrders.length > 0) {
              playKitchenSound()
            }
          }

          prevOrderIdsRef.current = newIds
          isFirstLoadRef.current = false
          setOrders(newOrders)
        })
        .catch((e) => setError(errMessage(e))),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  usePolling(load, POLL_MS)

  const advance = async (order, next) => {
    setBusyId(order.id)
    try {
      await api.patch(`/kitchen/orders/${order.id}/status`)
      load()
    } catch (e) {
      alert(errMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Kitchen Display</h1>
        <span className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
          Live — refreshes every {POLL_MS / 1000}s
        </span>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMN_DEFS.map((col) => {
          const list = orders.filter((o) => o.status === col.key)
          return (
            <section key={col.key} className={`rounded-xl border-2 ${col.tone} ${col.bg} p-3`}>
              <h2 className="mb-3 flex items-center justify-between px-1 font-bold">
                {col.title}
                <span className="rounded-full bg-white px-2 py-0.5 text-xs shadow">{list.length}</span>
              </h2>

              {list.length === 0 && (
                <p className="py-8 text-center text-sm text-neutral-400">No orders</p>
              )}

              <div className="space-y-3">
                {list.map((o) => (
                  <article key={o.id} className="card border-l-4 border-l-brand-red p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-brand-dark">{o.order_number}</p>
                        <p className="text-xs text-neutral-500">
                          {fmtTime(o.created_at)}
                          {o.payment_mode === 'cod' ? ' · 💵 COD' : ' · 📱 UPI'}
                        </p>
                      </div>
                      <span className="rounded-lg bg-brand-dark px-2 py-1 text-sm font-bold text-brand-gold">
                        {fmtINR(o.total_amount)}
                      </span>
                    </div>

                    <ul className="mt-3 space-y-1 border-y border-dashed border-neutral-200 py-2">
                      {o.items.map((i) => (
                        <li key={i.id} className="flex justify-between text-sm">
                          <span className="font-medium">
                            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded bg-brand-red text-xs font-bold text-white">
                              {i.quantity}
                            </span>
                            {i.item_name}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <p className="mt-2 text-xs text-neutral-500">
                      📍 {o.delivery_address} · 📞 {o.customer_phone}
                    </p>

                    {col.action && (
                      <button
                        disabled={busyId === o.id}
                        onClick={() => advance(o, col.next)}
                        className={`mt-3 w-full rounded-lg py-2 text-sm font-bold text-white transition ${col.toneBtn} disabled:opacity-50`}
                      >
                        {busyId === o.id ? 'Updating…' : `${col.action} →`}
                      </button>
                    )}
                    {o.delivery_agent && (
                      <p className="mt-2 text-xs text-sky-700">🛵 Assigned: {o.delivery_agent.name}</p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
