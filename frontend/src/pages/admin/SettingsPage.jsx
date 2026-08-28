import { useEffect, useState } from 'react'
import api, { errMessage } from '../../api/client'
import { fmtINR } from '../../constants'

/**
 * Manager-controlled shop settings (delivery charge, free-delivery threshold,
 * min order, GST%, shop name/tagline). Public /api/settings is used by the
 * checkout page; the manager PUTs through /api/admin/settings.
 */
export default function SettingsPage() {
  const [form, setForm] = useState(null)
  const [original, setOriginal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/admin/settings')
      .then((r) => { setForm(r.data.settings); setOriginal(r.data.settings) })
      .catch((e) => setError(errMessage(e, 'Could not load settings')))
  }, [])

  if (form === null) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center text-neutral-500">
        {error ? <p className="text-red-600">{error}</p> : 'Loading settings…'}
      </main>
    )
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(original)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const payload = {
        delivery_charge: Number(form.delivery_charge) || 0,
        free_delivery_above: Number(form.free_delivery_above) || 0,
        min_order_amount: Number(form.min_order_amount) || 0,
        gst_percent: Number(form.gst_percent) || 0,
        shop_name: form.shop_name,
        shop_tagline: form.shop_tagline,
        is_shop_open: Boolean(form.is_shop_open),
        closed_message: form.closed_message || '',
      }
      const res = await api.put('/admin/settings', payload)
      setForm(res.data.settings); setOriginal(res.data.settings)
      setMessage('✅ Settings saved — live on customer app now')
      setTimeout(() => setMessage(''), 4000)
    } catch (err) {
      setError(errMessage(err))
    } finally { setBusy(false) }
  }

  const reset = () => {
    setForm(original)
    setMessage('Reverted unsaved changes')
    setTimeout(() => setMessage(''), 2000)
  }

  // helpers for the live preview at two example cart sizes
  const preview = (subtotal = 500) => {
    const sub = Number(subtotal)
    const dc = Number(form.delivery_charge) || 0
    const freeAbove = Number(form.free_delivery_above) || 0
    const dcApplied = freeAbove > 0 && sub >= freeAbove ? 0 : dc
    return { sub, dc: dcApplied, total: sub + dcApplied }
  }
  const ex1 = preview(300)
  const ex2 = preview(800)


  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold">Shop Settings</h1>
        <p className="text-sm text-neutral-500">
          Delivery charges, free-delivery threshold, minimum order amount etc.
          Changes are live immediately for customers on checkout.
        </p>
      </div>

      {message && (
        <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <form onSubmit={save} className="space-y-6">
        <section className={`card p-5 ${form.is_shop_open ? 'border-green-300' : 'border-red-300 bg-red-50/40'}`}>
          <h2 className="mb-1 font-display text-lg font-bold">
            {form.is_shop_open ? '🟢 Shop is OPEN' : '🔴 Shop is CLOSED'}
          </h2>
          <p className="mb-3 text-xs text-neutral-500">
            Master switch. Band hone par <code>POST /api/orders</code> turant
            503 return karega — customer app cart aur checkout me message dikh
            jayega, koi naya order create nahi hoga. In-flight orders (pending
            / cooking / out for delivery) par koi asar nahi.
          </p>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3">
            <input
              type="checkbox"
              checked={Boolean(form.is_shop_open)}
              onChange={(e) => set('is_shop_open', e.target.checked)}
              className="h-5 w-5 cursor-pointer accent-brand-red"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-neutral-800">
                {form.is_shop_open
                  ? 'Customers abhi order place kar sakte hain'
                  : 'New orders BLOCKED — kitchen/delivery unaffected'}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${
              form.is_shop_open
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {form.is_shop_open ? 'OPEN' : 'CLOSED'}
            </span>
          </label>
          <div className="mt-3">
            <Field
              label="Closed message (customer ko dikhega)"
              value={form.closed_message}
              onChange={(v) => set('closed_message', v)}
              placeholder="Shop is currently closed. Please come back during business hours 🙏"
            />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-display text-lg font-bold">Shop Identity</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shop name" value={form.shop_name}
              onChange={(v) => set('shop_name', v)}
              placeholder="Dorito Pizza and Bakery" />
            <Field label="Tagline / sub-name" value={form.shop_tagline}
              onChange={(v) => set('shop_tagline', v)}
              placeholder="Jamtara Road, Palojori" />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-display text-lg font-bold">Delivery &amp; Order Rules</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField
              label="Delivery charge (₹)"
              hint="Flat fee added to every order below the free-delivery threshold."
              value={form.delivery_charge}
              onChange={(v) => set('delivery_charge', v)}
              min={0} step={1} suffix="₹" />
            <NumField
              label="Free delivery above (₹)"
              hint="If subtotal ≥ this, delivery is free. Set 0 to always charge."
              value={form.free_delivery_above}
              onChange={(v) => set('free_delivery_above', v)}
              min={0} step={50} suffix="₹" />
            <NumField
              label="Minimum order amount (₹)"
              hint="Cart must be at least this to checkout. 0 = no minimum."
              value={form.min_order_amount}
              onChange={(v) => set('min_order_amount', v)}
              min={0} step={10} suffix="₹" />
            <NumField
              label="GST / tax (%)"
              hint="Informational — not added to totals yet. Kept for the receipt."
              value={form.gst_percent}
              onChange={(v) => set('gst_percent', v)}
              min={0} step={0.5} suffix="%" />
          </div>
        </section>


        <section className="card border-brand-gold/40 bg-amber-50/40 p-5">
          <h2 className="mb-3 font-display text-lg font-bold">👀 Live Preview</h2>
          <p className="mb-3 text-xs text-neutral-600">
            How the customer's order total will look at checkout with these settings.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <PreviewCard title="Small order" subtotal={ex1.sub} delivery={ex1.dc} total={ex1.total} />
            <PreviewCard title="Large order" subtotal={ex2.sub} delivery={ex2.dc} total={ex2.total} />
          </div>
        </section>

        <div className="flex gap-3">
          <button type="submit" disabled={!dirty || busy}
            className="btn-primary flex-1 disabled:opacity-50">
            {busy ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
          </button>
          <button type="button" onClick={reset} disabled={!dirty || busy}
            className="btn-secondary disabled:opacity-50">
            Revert
          </button>
        </div>
      </form>
    </main>
  )
}


/* ----------------------------- bits ----------------------------- */
function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input className="input" value={value || ''}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  )
}

function NumField({ label, hint, value, onChange, min, step, suffix }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <div className="relative">
        <input className="input pr-10" type="number" inputMode="decimal"
          min={min} step={step} value={value ?? 0}
          onChange={(e) => onChange(e.target.value)} />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
            {suffix}
          </span>
        )}
      </div>
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  )
}

function PreviewCard({ title, subtotal, delivery, total }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{title}</p>
      <div className="mt-1 space-y-0.5 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span><span>{fmtINR(subtotal)}</span>
        </div>
        <div className="flex justify-between text-neutral-600">
          <span>Delivery</span>
          <span>{delivery === 0 ? 'FREE' : fmtINR(delivery)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t pt-1 font-bold">
          <span>Total</span>
          <span className="text-brand-dark">{fmtINR(total)}</span>
        </div>
      </div>
    </div>
  )
}

