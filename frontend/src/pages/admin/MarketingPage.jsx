import { useCallback, useEffect, useState } from 'react'
import api, { errMessage } from '../../api/client'

export default function MarketingPage() {
  const [form, setForm] = useState({ title: '', message: '', segment: 'optin' })
  const [wa, setWa] = useState(null)
  const [outbox, setOutbox] = useState([])
  const [vars, setVars] = useState([])
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.get('/admin/whatsapp/status').then((r) => setWa(r.data)).catch(() => {})
    api.get('/admin/outbox').then((r) => setOutbox(r.data.messages || [])).catch(() => {})
    api.get('/admin/broadcast/vars').then((r) => setVars(r.data.variables || [])).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  /** Live template check — surface the same 400 the API will return so the
   *  manager sees the problem before clicking Send. */
  const liveTemplateError = (() => {
    const allVars = new Set(vars.map((v) => v.key))
    for (const field of ['title', 'message']) {
      const text = form[field] || ''
      // count `{{` occurrences — anything that doesn't match a known var fails
      const matches = [...text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]{0,31})\s*\}\}/g)]
      const openCount = (text.match(/\{\{/g) || []).length
      if (openCount !== matches.length) {
        return `${field}: malformed {{...}} placeholder`
      }
      for (const m of matches) {
        if (!allVars.has(m[1])) {
          return `${field}: unknown variable {{${m[1]}}}`
        }
      }
    }
    return ''
  })()

  const send = async (e) => {
    e.preventDefault()
    setBusy(true); setResult(''); setError('')
    try {
      const res = await api.post('/admin/broadcast', form)
      setResult(`✅ ${res.data.sent} customers ko personalised WhatsApp + in-app notification queued`)
      setForm({ title: '', message: '', segment: 'optin' })
      load()
    } catch (err) { setError(errMessage(err)) }
    finally { setBusy(false) }
  }

  const statusColor = wa?.connected ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300'

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      <h1 className="font-display text-2xl font-bold">Marketing &amp; WhatsApp</h1>

      {/* WhatsApp connection status */}
      <section className="card mt-4 p-4">
        <h2 className="mb-2 font-semibold">WhatsApp Connection (Evolution API)</h2>
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusColor}`}>
            {wa ? (wa.connected ? '✅ Connected' : '⚠️ Not connected') : 'Checking…'}
          </span>
          {wa && !wa.connected && (
            <span className="text-xs text-neutral-500">
              {wa.reason || 'EVOLUTION_API_KEY set nahi'}
              {wa.state ? ` · state=${wa.state}` : ''}
            </span>
          )}
          <button onClick={load} className="btn-secondary !py-1.5 text-xs">Refresh</button>
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          Server: http://100.98.94.128:8087 · Instance: Dorito · API key backend .env me
          (EVOLUTION_API_KEY) set karein.
        </p>
      </section>

      {/* broadcast */}
      <section className="card mt-4 p-5">
        <h2 className="mb-1 font-semibold">Broadcast Message</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Opted-in customers ko WhatsApp (anti-ban pacing ke saath) + in-app notification jayegi.
        </p>
        {result && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{result}</p>}
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <form onSubmit={send} className="space-y-3">
          <select className="input" value={form.segment}
                  onChange={(e) => setForm({ ...form, segment: e.target.value })}>
            <option value="optin">Opted-in customers</option>
            <option value="all">All active customers</option>
          </select>
          <input className="input" placeholder="Title (e.g. 🎉 Festive Offer!)" value={form.title}
                 onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <textarea className="input min-h-[90px]" placeholder="Message (e.g. {{name}}, sab items par 20% off — {{order_count}} orders ke liye!)"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })} required />

          {/* template variable hint (P3.7) */}
          {vars.length > 0 && (
            <div className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-600">
              <p className="mb-1 font-semibold text-neutral-700">Personalise with:</p>
              <div className="flex flex-wrap gap-1.5">
                {vars.map((v) => (
                  <code
                    key={v.key}
                    title={v.description}
                    onClick={() => setForm({ ...form, message: `${form.message} {{${v.key}}}` })}
                    className="cursor-pointer rounded bg-white px-2 py-0.5 text-[11px] font-mono text-brand-dark shadow-sm ring-1 ring-neutral-200 hover:bg-brand-gold/20"
                  >
                    {`{{${v.key}}}`}
                  </code>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-neutral-400">Click to insert. Max 1-2 messages / week per customer.</p>
            </div>
          )}

          {liveTemplateError && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⚠️ {liveTemplateError}
            </p>
          )}

          <button disabled={busy || !!liveTemplateError} className="btn-primary w-full disabled:opacity-50">
            {busy ? 'Sending…' : '📣 Send Broadcast'}
          </button>
        </form>
      </section>

      {/* outbox audit */}
      <section className="card mt-4 p-5">
        <h2 className="mb-3 font-semibold">Recent WhatsApp Messages (audit)</h2>
        <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1 text-sm">
          {outbox.length === 0 && <p className="text-neutral-500">No messages yet.</p>}
          {outbox.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.preview}</p>
                <p className="text-[10px] text-neutral-400">
                  {m.phone} · {m.kind} · {m.created_at?.slice(0, 16)?.replace('T', ' ')}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                m.status === 'sent' ? 'bg-green-100 text-green-700'
                : m.status === 'failed' ? 'bg-red-100 text-red-700'
                : 'bg-neutral-200 text-neutral-600'
              }`}>
                {m.status}{m.error ? ' · ' + m.error : ''}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
