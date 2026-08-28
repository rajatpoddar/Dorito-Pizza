import { useCallback, useEffect, useState } from 'react'
import api, { errMessage } from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import { fmtINR, fmtTime, STATUS_LABELS } from '../../constants'

export default function ManageOrdersPage() {
  const [orders, setOrders] = useState([])
  const [agents, setAgents] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    api
      .get('/admin/orders', { params: statusFilter ? { status: statusFilter } : {} })
      .then((r) => setOrders(r.data.orders))
      .catch((e) => setError(errMessage(e)))
      .finally(() => setLoading(false))
  }, [statusFilter])

  useEffect(() => {
    api.get('/admin/staff?role=delivery').then((r) => setAgents(r.data.staff)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  const assign = async (orderId, agentId) => {
    try {
      await api.patch(`/admin/orders/${orderId}/assign`, { agent_id: Number(agentId) })
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

      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="card p-4">
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

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <span className="text-lg font-bold">{fmtINR(o.total_amount)}</span>
              <div className="flex items-center gap-2">
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
                {o.status !== 'delivered' && o.status !== 'cancelled' && (
                  <button
                    onClick={() => cancel(o.id)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
