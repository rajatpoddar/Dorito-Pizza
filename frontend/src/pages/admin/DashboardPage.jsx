import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errMessage } from '../../api/client'
import { usePolling } from '../../hooks'
import { fmtINR } from '../../constants'

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [topItems, setTopItems] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(
    () =>
      api
        .get('/admin/dashboard')
        .then((res) => setData(res.data))
        .catch((e) => setError(errMessage(e))),
    [],
  )

  useEffect(() => {
    load()
    api.get('/admin/dashboard/top-items').then((r) => setTopItems(r.data.items)).catch(() => {})
  }, [load])

  // Refresh dashboard every 10s.
  usePolling(load, 10000)

  if (error) return <main className="mx-auto max-w-5xl px-4 py-16 text-center text-red-500">{error}</main>
  if (!data) return <main className="mx-auto max-w-5xl px-4 py-16 text-center text-neutral-500">Loading dashboard…</main>

  const { today, active_orders, status_counts } = data

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <h1 className="font-display text-2xl font-bold">Manager Dashboard</h1>
      <p className="mb-6 text-sm text-neutral-500">Dorito Pizza and Bakery — live overview</p>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Today's Sales" value={fmtINR(today.total_sales)} icon="💰" tone="bg-green-50 text-green-700" />
        <Kpi label="Today's Orders" value={today.total_orders} icon="🧾" tone="bg-blue-50 text-blue-700" />
        <Kpi label="Active Orders" value={active_orders} icon="⚡" tone="bg-amber-50 text-amber-700" />
        <Kpi label="Delivered Today" value={today.delivered_orders} icon="✅" tone="bg-violet-50 text-violet-700" />
      </div>

      {/* quick links */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link to="/admin/orders" className="card p-4 transition hover:border-brand-red">
          <p className="text-2xl">📋</p>
          <p className="mt-1 font-semibold">Manage Orders</p>
          <p className="text-xs text-neutral-500">View all &amp; assign delivery agents</p>
        </Link>
        <Link to="/admin/menu" className="card p-4 transition hover:border-brand-red">
          <p className="text-2xl">🍕</p>
          <p className="mt-1 font-semibold">Manage Menu</p>
          <p className="text-xs text-neutral-500">Prices, availability &amp; new items</p>
        </Link>
        <Link to="/admin/staff" className="card p-4 transition hover:border-brand-red">
          <p className="text-2xl">👥</p>
          <p className="mt-1 font-semibold">Manage Staff</p>
          <p className="text-xs text-neutral-500">Kitchen &amp; delivery accounts</p>
        </Link>
      </div>

      {/* status breakdown */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">All Orders by Status</h2>
          <div className="space-y-2">
            {Object.entries(status_counts).map(([status, n]) => (
              <div key={status} className="flex items-center gap-3">
                <span className="w-36 text-sm capitalize text-neutral-600">
                  {status.replace(/_/g, ' ')}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-brand-red transition-all"
                    style={{ width: `${Math.min(100, (n / Math.max(1, Object.values(status_counts).reduce((a, b) => a + b, 0))) * 100)}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-bold">{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Top Selling Items</h2>
          {topItems.length === 0 ? (
            <p className="text-sm text-neutral-500">No sales yet — data appears after the first order.</p>
          ) : (
            <ol className="space-y-2">
              {topItems.map((t, i) => (
                <li key={t.item_name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gold/20 text-xs font-bold text-yellow-700">
                      {i + 1}
                    </span>
                    {t.item_name}
                  </span>
                  <span className="text-neutral-500">
                    {t.quantity} sold · <span className="font-semibold text-neutral-800">{fmtINR(t.revenue)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </main>
  )
}

function Kpi({ label, value, icon, tone }) {
  return (
    <div className="card p-4">
      <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg ${tone}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  )
}
