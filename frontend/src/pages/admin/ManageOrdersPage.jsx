import { useCallback, useEffect, useRef, useState } from 'react'
import api, { errMessage } from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import { usePolling } from '../../hooks'
import { fmtINR, fmtTime, STATUS_LABELS } from '../../constants'

// ── notification sounds from /public/sounds/ ──
const NEW_ORDER_AUDIO = typeof Audio !== 'undefined' ? new Audio('/sounds/01_new_order.mp3') : null
const ACCEPTED_AUDIO = typeof Audio !== 'undefined' ? new Audio('/sounds/02_order_accepted.mp3') : null
const REJECTED_AUDIO = typeof Audio !== 'undefined' ? new Audio('/sounds/03_order_rejected.mp3') : null
const READY_AUDIO = typeof Audio !== 'undefined' ? new Audio('/sounds/07_driver_pickup_ready.mp3') : null
const DELIVERED_AUDIO = typeof Audio !== 'undefined' ? new Audio('/sounds/09_order_delivered.mp3') : null

function playNewOrderSound() {
  if (NEW_ORDER_AUDIO) {
    NEW_ORDER_AUDIO.currentTime = 0
    NEW_ORDER_AUDIO.play().catch(() => {}) // autoplay may be blocked
  }
}
function playAcceptedSound() {
  if (ACCEPTED_AUDIO) {
    ACCEPTED_AUDIO.currentTime = 0
    ACCEPTED_AUDIO.play().catch(() => {})
  }
}
function playRejectedSound() {
  if (REJECTED_AUDIO) {
    REJECTED_AUDIO.currentTime = 0
    REJECTED_AUDIO.play().catch(() => {})
  }
}
function playReadySound() {
  if (READY_AUDIO) {
    READY_AUDIO.currentTime = 0
    READY_AUDIO.play().catch(() => {})
  }
}
function playDeliveredSound() {
  if (DELIVERED_AUDIO) {
    DELIVERED_AUDIO.currentTime = 0
    DELIVERED_AUDIO.play().catch(() => {})
  }
}

function sendBrowserNotification(title, body) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((p) => {
      if (p === 'granted') new Notification(title, { body, icon: '/favicon.ico' })
    })
  }
}

export default function ManageOrdersPage() {
  const [orders, setOrders] = useState([])
  const [agents, setAgents] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [newOrderIds, setNewOrderIds] = useState(new Set())
  const [readyOrderIds, setReadyOrderIds] = useState(new Set())
  const prevOrderIdsRef = useRef(new Set())
  const prevStatusRef = useRef(new Map()) // id → status (for transition detection)
  const isFirstLoadRef = useRef(true)

  const load = useCallback(() => {
    api
      .get('/admin/orders', { params: statusFilter ? { status: statusFilter } : {} })
      .then((r) => {
        const newOrders = r.data.orders
        const newIds = new Set(newOrders.map(o => o.id))
        const newStatusMap = new Map(newOrders.map((o) => [o.id, o.status]))

        // Detect transitions since last poll (skip on first load).
        if (!isFirstLoadRef.current) {
          const prevIds = prevOrderIdsRef.current
          const prevStatus = prevStatusRef.current

          // 1. Brand-new pending order — sound + browser notif.
          const freshOrders = newOrders.filter((o) => o.status === 'pending' && !prevIds.has(o.id))
          if (freshOrders.length > 0) {
            playNewOrderSound()
            freshOrders.forEach((o) => {
              sendBrowserNotification(
                `🍕 New Order: ${o.order_number}`,
                `${o.customer_name} — ${o.items.map((i) => i.item_name).join(', ')}\nTotal: ₹${o.total_amount}`,
              )
            })
            setNewOrderIds((prev) => {
              const next = new Set(prev)
              freshOrders.forEach((o) => next.add(o.id))
              return next
            })
            setTimeout(() => {
              setNewOrderIds((prev) => {
                const next = new Set(prev)
                freshOrders.forEach((o) => next.delete(o.id))
                return next
              })
            }, 10000)
          }

          // 2. pending → accepted (manager just clicked Accept on a known order).
          const justAccepted = newOrders.filter(
            (o) => o.status === 'accepted' && prevStatus.get(o.id) === 'pending',
          )
          if (justAccepted.length > 0) {
            playAcceptedSound()
          }

          // 3. pending → rejected.
          const justRejected = newOrders.filter(
            (o) => o.status === 'rejected' && prevStatus.get(o.id) === 'pending',
          )
          if (justRejected.length > 0) {
            playRejectedSound()
          }

          // 4. preparing → ready (only fires on the actual transition).
          const newlyReady = newOrders.filter(
            (o) => o.status === 'ready' && prevStatus.get(o.id) === 'preparing',
          )
          if (newlyReady.length > 0) {
            playReadySound()
            newlyReady.forEach((o) => {
              sendBrowserNotification(
                `🛵 Ready: ${o.order_number}`,
                `Order ready hai — driver assign karein!`,
              )
            })
            setReadyOrderIds((prev) => {
              const next = new Set(prev)
              newlyReady.forEach((o) => next.add(o.id))
              return next
            })
          }

          // 5. out_for_delivery → delivered.
          const justDelivered = newOrders.filter(
            (o) => o.status === 'delivered' && prevStatus.get(o.id) === 'out_for_delivery',
          )
          if (justDelivered.length > 0) {
            playDeliveredSound()
          }

          // Remove ready-highlight for orders no longer in ready state.
          setReadyOrderIds((prev) => {
            const next = new Set(prev)
            for (const id of next) {
              const o = newOrders.find((ord) => ord.id === id)
              if (!o || o.status !== 'ready') next.delete(id)
            }
            return next
          })
        }

        prevOrderIdsRef.current = newIds
        prevStatusRef.current = newStatusMap
        isFirstLoadRef.current = false
        setOrders(newOrders)
      })
      .catch((e) => setError(errMessage(e)))
      .finally(() => setLoading(false))
  }, [statusFilter])

  useEffect(() => {
    api.get('/admin/staff?role=delivery').then((r) => setAgents(r.data.staff)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Poll every 5s — paused automatically when the tab is hidden (RULES §11).
  usePolling(load, 5000)

  const assign = async (orderId, agentId) => {
    try {
      await api.patch(`/admin/orders/${orderId}/assign`, { agent_id: Number(agentId) })
      load()
    } catch (e) {
      alert(errMessage(e))
    }
  }

  const accept = async (orderId) => {
    try {
      await api.patch(`/admin/orders/${orderId}/accept`)
      load()
    } catch (e) {
      alert(errMessage(e))
    }
  }

  const reject = async (orderId) => {
    if (!rejectReason.trim()) {
      alert('Please enter a reason for rejection')
      return
    }
    try {
      await api.patch(`/admin/orders/${orderId}/reject`, { reason: rejectReason.trim() })
      setRejectModal(null)
      setRejectReason('')
      load()
    } catch (e) {
      alert(errMessage(e))
    }
  }

  const cancel = async (orderId) => {
    if (!window.confirm('Cancel this order?')) return
    try {
      await api.patch(`/admin/orders/${orderId}/cancel`)
      load()
    } catch (e) {
      alert(errMessage(e))
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">All Orders</h1>
        {newOrderIds.size > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 animate-pulse">
            🔴 {newOrderIds.size} new order{newOrderIds.size > 1 ? 's' : ''}!
          </span>
        )}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input !w-auto"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && <p className="text-neutral-500">Loading orders…</p>}

      {!loading && orders.length === 0 && (
        <p className="py-16 text-center text-neutral-500">No orders found.</p>
      )}

      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card mx-4 w-full max-w-md p-6">
            <h2 className="mb-4 font-display text-lg font-bold">Reject Order</h2>
            <p className="mb-2 text-sm text-neutral-600">
              Are you sure you want to reject order #{orders.find(o => o.id === rejectModal)?.order_number}?
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              className="mb-4 w-full rounded-lg border p-2 text-sm"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectModal(null)
                  setRejectReason('')
                }}
                className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={() => reject(rejectModal)}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
              >
                Reject Order
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {orders.map((o) => (
          <div
            key={o.id}
            className={`card p-4 transition-all duration-300 ${
              newOrderIds.has(o.id)
                ? 'ring-2 ring-red-400 bg-red-50 shadow-lg'
                : readyOrderIds.has(o.id)
                  ? 'ring-2 ring-amber-400 bg-amber-50 shadow-lg'
                  : ''
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold text-brand-dark">{o.order_number}</p>
                <p className="text-xs text-neutral-500">
                  {fmtTime(o.created_at)} · {o.payment_mode === 'cod' ? '💵 COD' : '📱 UPI'} ·{' '}
                  {o.payment_status}
                </p>
              </div>
              <StatusBadge status={o.status} />
            </div>

            <p className="mt-2 text-sm text-neutral-700">
              {o.items.map((i) => `${i.item_name} ×${i.quantity}`).join(', ')}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              👤 {o.customer_name} · 📞 {o.customer_phone}
              <br />📍 {o.delivery_address}
            </p>

            {o.reject_reason && (
              <p className="mt-2 text-xs text-red-600">Reason: {o.reject_reason}</p>
            )}
            {o.status === 'ready' && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                🛵 Driver assign karein!
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <span className="text-lg font-bold">{fmtINR(o.total_amount)}</span>
              <div className="flex items-center gap-2">
                {o.status === 'pending' && (
                  <>
                    <button
                      onClick={() => accept(o.id)}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
                    >
                      ✅ Accept
                    </button>
                    <button
                      onClick={() => setRejectModal(o.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      ❌ Reject
                    </button>
                  </>
                )}
                {o.status !== 'pending' && o.status !== 'delivered' && o.status !== 'cancelled' && o.status !== 'rejected' && (
                  <>
                    <select
                      value={o.delivery_agent?.id || ''}
                      onChange={(e) => assign(o.id, e.target.value)}
                      className="input !w-auto !py-1.5 text-xs"
                    >
                      <option value="">🛵 Assign agent…</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.phone})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => cancel(o.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
