import { useCallback, useEffect, useRef, useState } from 'react'
import api, { errMessage } from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import { usePolling } from '../../hooks'
import { fmtINR, fmtTime } from '../../constants'

const POLL_MS = 5000

// ── notification sounds (from /public/sounds/) ──
const NEW_DELIVERY_AUDIO = typeof Audio !== 'undefined' ? new Audio('/sounds/06_driver_new_delivery.mp3') : null
const DELIVERED_BEEP_AUDIO = typeof Audio !== 'undefined' ? new Audio('/sounds/09_order_delivered.mp3') : null

function playNewDeliverySound() {
  if (NEW_DELIVERY_AUDIO) {
    NEW_DELIVERY_AUDIO.currentTime = 0
    NEW_DELIVERY_AUDIO.play().catch(() => {})
  }
}
function playDeliveredSound() {
  if (DELIVERED_BEEP_AUDIO) {
    DELIVERED_BEEP_AUDIO.currentTime = 0
    DELIVERED_BEEP_AUDIO.play().catch(() => {})
  }
}

function browserNotify(title, body) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((p) => {
      if (p === 'granted') new Notification(title, { body, icon: '/favicon.ico' })
    })
  }
}

export default function DeliveryPage() {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [otp, setOtp] = useState({}) // { orderId: '1234' }
  const [newDeliveryIds, setNewDeliveryIds] = useState(new Set())
  const prevOrdersRef = useRef(new Map()) // id → status
  const isFirstLoadRef = useRef(true)

  const load = useCallback(
    () =>
      api
        .get('/delivery/orders')
        .then((r) => {
          const newOrders = r.data.orders
          const newMap = new Map(newOrders.map((o) => [o.id, o.status]))

          if (!isFirstLoadRef.current) {
            const prevMap = prevOrdersRef.current

            // NEW delivery assignment — order just appeared on this driver's list.
            const freshDeliveries = newOrders.filter((o) => !prevMap.has(o.id))
            if (freshDeliveries.length > 0) {
              playNewDeliverySound()
              freshDeliveries.forEach((o) =>
                browserNotify(`🛵 New delivery: ${o.order_number}`,
                  `${o.customer_name} · ${o.delivery_address}`),
              )
              setNewDeliveryIds((prev) => {
                const next = new Set(prev)
                freshDeliveries.forEach((o) => next.add(o.id))
                return next
              })
              setTimeout(() => {
                setNewDeliveryIds((prev) => {
                  const next = new Set(prev)
                  freshDeliveries.forEach((o) => next.delete(o.id))
                  return next
                })
              }, 12000)
            }

            // Orders that disappeared from the list (got delivered).
            const completed = Array.from(prevMap.keys()).filter((id) => !newMap.has(id))
            if (completed.length > 0) {
              playDeliveredSound()
            }
          }

          prevOrdersRef.current = newMap
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

  const advance = async (order) => {
    setBusyId(order.id)
    try {
      await api.patch(`/delivery/orders/${order.id}/status`)
      load()
    } catch (e) {
      alert(errMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const deliver = async (order) => {
    const code = (otp[order.id] || '').replace(/\D/g, '')
    if (code.length !== 4) {
      alert('Customer se 4-digit OTP lein')
      return
    }
    setBusyId(order.id)
    try {
      await api.patch(`/delivery/orders/${order.id}/deliver`, { otp: code })
      setOtp((s) => ({ ...s, [order.id]: '' }))
      load()
    } catch (e) {
      alert(errMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const active = orders.filter((o) => o.status !== 'delivered')
  const done = orders.filter((o) => o.status === 'delivered')

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">My Deliveries</h1>
        <span className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
          Live
        </span>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}

      {active.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-5xl">🛵</p>
          <p className="mt-4 text-neutral-500">No active deliveries right now.</p>
          <p className="text-xs text-neutral-400">New assignments appear here automatically.</p>
        </div>
      )}

      <div className="space-y-4">
        {active.map((o) => (
          <article
            key={o.id}
            className={`card border-l-4 p-4 transition-all duration-300 ${
              newDeliveryIds.has(o.id)
                ? 'border-l-sky-500 ring-2 ring-sky-300 animate-pulse'
                : 'border-l-brand-gold'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-brand-dark">{o.order_number}</p>
                <p className="text-xs text-neutral-500">{fmtTime(o.created_at)}</p>
              </div>
              <StatusBadge status={o.status} />
            </div>

            <div className="mt-3 space-y-1.5 rounded-lg bg-neutral-50 p-3 text-sm">
              <p>👤 <span className="font-semibold">{o.customer_name}</span></p>
              <p>
                📞{' '}
                <a href={`tel:${o.customer_phone}`} className="font-semibold text-blue-600 hover:underline">
                  {o.customer_phone}
                </a>
              </p>
              <p>📍 {o.delivery_address}</p>
              <p className="border-t pt-1.5 font-semibold">
                {o.payment_mode === 'cod'
                  ? `💵 Collect ${fmtINR(o.total_amount)} cash`
                  : `📱 UPI ${fmtINR(o.total_amount)} — verify payment`}
                {o.payment_status === 'paid' && ' (paid ✅)'}
              </p>
            </div>

            <ul className="mt-3 text-sm text-neutral-700">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between">
                  <span>{i.item_name} × {i.quantity}</span>
                </li>
              ))}
            </ul>

            {o.status === 'ready' ? (
              <button
                disabled={busyId === o.id}
                onClick={() => advance(o)}
                className="btn-primary mt-3 w-full"
              >
                {busyId === o.id ? 'Starting…' : '🛵 Start Delivery (Out for Delivery)'}
              </button>
            ) : (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-xs font-semibold text-green-800">
                  🔐 Customer se 4-digit OTP lein (order confirm karne ke liye)
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={4}
                    placeholder="••••"
                    value={otp[o.id] || ''}
                    onChange={(e) =>
                      setOtp((s) => ({
                        ...s,
                        [o.id]: e.target.value.replace(/\D/g, '').slice(0, 4),
                      }))
                    }
                    className="w-24 rounded-lg border border-green-300 px-3 py-2 text-center text-lg font-bold tracking-[0.4em] text-green-900 focus:border-green-500 focus:outline-none"
                  />
                  <button
                    disabled={busyId === o.id || (otp[o.id] || '').length !== 4}
                    onClick={() => deliver(o)}
                    className="btn-primary flex-1 !bg-green-600 hover:!bg-green-700 disabled:opacity-50"
                  >
                    {busyId === o.id ? 'Verifying…' : '✅ Verify OTP & Deliver'}
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>

      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-500">
            Completed today ({done.length})
          </h2>
          <div className="card divide-y divide-neutral-100 text-sm">
            {done.map((o) => (
              <div key={o.id} className="flex items-center justify-between p-3">
                <span className="font-medium">{o.order_number}</span>
                <span className="text-neutral-500">{o.customer_name}</span>
                <span className="font-semibold text-green-600">{fmtINR(o.total_amount)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
