import { useCallback, useEffect, useState } from 'react'
import api, { errMessage } from '../../api/client'
import { fmtINR } from '../../constants'

const EMPTY = {
  code: '', title: '', description: '', discount_type: 'percent', value: '',
  min_order_amount: '', max_discount: '', ends_at: '', usage_limit: '',
}

export default function ManageOffersPage() {
  const [offers, setOffers] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(() =>
    api.get('/admin/offers').then((r) => setOffers(r.data.offers)).catch((e) => setError(errMessage(e))), [])

  useEffect(() => { load() }, [load])

  const create = async (e) => {
    e.preventDefault()
    setError(''); setMessage('')
    try {
      await api.post('/admin/offers', {
        ...form,
        value: Number(form.value),
        min_order_amount: Number(form.min_order_amount || 0),
        max_discount: form.max_discount ? Number(form.max_discount) : null,
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      })
      setForm(EMPTY)
      setMessage('✅ Offer ban gaya')
      load()
    } catch (err) { setError(errMessage(err)) }
  }

  const toggle = async (o) => {
    try {
      await api.put(`/admin/offers/${o.id}`, { is_active: !o.is_active })
      load()
    } catch (err) { alert(errMessage(err)) }
  }

  const remove = async (o) => {
    if (!window.confirm(`Offer '${o.code}' delete karein?`)) return
    try { await api.delete(`/admin/offers/${o.id}`); load() }
    catch (err) { alert(errMessage(err)) }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      <h1 className="mb-4 font-display text-2xl font-bold">Offers &amp; Discounts</h1>

      {message && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <form onSubmit={create} className="card mb-6 grid gap-3 p-4 sm:grid-cols-2">
        <input className="input uppercase" placeholder="Code (e.g. DORITO20)" value={form.code}
               onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
        <input className="input" placeholder="Title (e.g. 20% Off)" value={form.title}
               onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <select className="input" value={form.discount_type}
                onChange={(e) => setForm({ ...form, discount_type: e.target.value })}>
          <option value="percent">Percent (%)</option>
          <option value="flat">Flat (₹)</option>
        </select>
        <input className="input" type="number" min="1" step="0.01"
               placeholder={form.discount_type === 'percent' ? 'Discount % (max 100)' : 'Discount ₹'}
               value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
        <input className="input" type="number" min="0" placeholder="Min order amount (₹)"
               value={form.min_order_amount} onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })} />
        <input className="input" type="number" min="0" placeholder="Max discount ₹ (percent cap)"
               value={form.max_discount} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} />
        <input className="input" type="datetime-local" placeholder="End date"
               value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
        <input className="input" type="number" min="1" placeholder="Usage limit (blank = unlimited)"
               value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} />
        <input className="input sm:col-span-2" placeholder="Description"
               value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="btn-primary sm:col-span-2">+ Create Offer</button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        {offers.map((o) => (
          <div key={o.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-brand-dark">{o.title}</p>
                <p className="text-xs text-neutral-500">CODE: <b>{o.code}</b></p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${o.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-600'}`}>
                {o.is_active ? 'Active' : 'Off'}
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-700">
              {o.discount_type === 'percent' ? `${o.value}% OFF` : fmtINR(o.value)} OFF
              {o.min_order_amount > 0 && ` · min ${fmtINR(o.min_order_amount)}`}
              {o.max_discount && ` · max ${fmtINR(o.max_discount)}`}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Used {o.used_count}{o.usage_limit ? ` / ${o.usage_limit}` : ''}
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => toggle(o)} className="btn-secondary !py-1.5 text-xs">
                {o.is_active ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => remove(o)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
