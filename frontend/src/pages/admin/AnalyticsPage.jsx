import { useEffect, useState } from 'react'
import api, { errMessage } from '../../api/client'
import { fmtINR } from '../../constants'

export default function AnalyticsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/admin/analytics').then((r) => setData(r.data)).catch((e) => setError(errMessage(e)))
  }, [])

  if (error) return <main className="mx-auto max-w-5xl px-4 py-16 text-center text-red-500">{error}</main>
  if (!data) return <main className="mx-auto max-w-5xl px-4 py-16 text-center text-neutral-500">Loading analytics…</main>

  const maxRevenue = Math.max(...data.daily.map((d) => d.revenue), 1)

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <h1 className="font-display text-2xl font-bold">Analytics</h1>
      <p className="mb-6 text-sm text-neutral-500">Business performance (non-cancelled orders)</p>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total Revenue" value={fmtINR(data.kpis.total_revenue)} />
        <Kpi label="Total Orders" value={data.kpis.total_orders} />
        <Kpi label="Avg Order Value" value={fmtINR(data.kpis.avg_order_value)} />
        <Kpi label="Discount Given" value={fmtINR(data.kpis.discount_given)} />
      </div>

      {/* daily revenue bar chart (SVG) */}
      <section className="card mt-6 p-5">
        <h2 className="mb-4 font-semibold">Last 7 days — Revenue &amp; Orders</h2>
        <div className="flex h-48 items-end gap-3">
          {data.daily.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-bold text-neutral-700">{fmtINR(d.revenue)}</span>
              <div className="w-full rounded-t bg-brand-red transition-all"
                   style={{ height: `${Math.max(6, (d.revenue / maxRevenue) * 130)}px` }} />
              <span className="text-[10px] text-neutral-500">{d.label}</span>
              <span className="text-[10px] text-neutral-400">{d.orders} orders</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* category split */}
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Category Sales</h2>
          {data.categories.length === 0 ? <p className="text-sm text-neutral-500">No data</p> : (
            <ul className="space-y-2">
              {data.categories.map((c) => (
                <li key={c.category} className="flex items-center justify-between text-sm">
                  <span>{c.category}</span>
                  <span className="font-semibold">{fmtINR(c.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* payment split + customers */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Payment Mode</h2>
            <div className="flex gap-4 text-sm">
              <div className="flex-1 rounded-lg bg-neutral-50 p-3 text-center">
                <p className="text-2xl font-bold">💵</p>
                <p className="font-semibold">COD</p>
                <p className="text-neutral-500">{data.payment.cod.orders} orders · {fmtINR(data.payment.cod.revenue)}</p>
              </div>
              <div className="flex-1 rounded-lg bg-neutral-50 p-3 text-center">
                <p className="text-2xl font-bold">📱</p>
                <p className="font-semibold">UPI</p>
                <p className="text-neutral-500">{data.payment.upi.orders} orders · {fmtINR(data.payment.upi.revenue)}</p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Customers</h2>
            <p className="text-sm">New: <b>{data.customers.new}</b> · Returning: <b>{data.customers.returning}</b></p>
            <p className="text-sm text-neutral-500">Repeat rate: <b>{data.customers.repeat_rate_pct}%</b></p>
          </div>
        </div>
      </div>

      {/* top agents */}
      <section className="card mt-4 p-5">
        <h2 className="mb-3 font-semibold">Top Delivery Agents</h2>
        {data.agents.length === 0 ? <p className="text-sm text-neutral-500">No deliveries yet</p> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.agents.map((a) => (
              <div key={a.name} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                <span>🛵 {a.name}</span>
                <span className="font-semibold">{a.deliveries} · {fmtINR(a.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function Kpi({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  )
}
