import { useCallback, useEffect, useState } from 'react'
import api, { errMessage } from '../../api/client'
import { ROLE_LABELS } from '../../constants'

const EMPTY = { name: '', phone: '', password: '', role: 'delivery' }

export default function ManageStaffPage() {
  const [staff, setStaff] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(
    () =>
      api
        .get('/admin/staff')
        .then((r) => setStaff(r.data.staff))
        .catch((e) => setError(errMessage(e))),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  const createStaff = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/admin/staff', form)
      setMessage(`✅ ${form.name} added as ${ROLE_LABELS[form.role]}`)
      setForm(EMPTY)
      load()
    } catch (err) {
      setError(errMessage(err))
    }
  }

  const toggleActive = async (member) => {
    try {
      await api.patch(`/admin/staff/${member.id}`, { is_active: !member.is_active })
      load()
    } catch (err) {
      alert(errMessage(err))
    }
  }

  const grouped = {
    manager: staff.filter((s) => s.role === 'manager'),
    cook: staff.filter((s) => s.role === 'cook'),
    delivery: staff.filter((s) => s.role === 'delivery'),
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <h1 className="mb-4 font-display text-2xl font-bold">Staff Accounts</h1>

      {message && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <form onSubmit={createStaff} className="card mb-6 grid gap-3 p-4 sm:grid-cols-2">
        <input
          className="input"
          placeholder="Full name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="input"
          inputMode="numeric"
          placeholder="10-digit mobile (login id)"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password (min 6 chars)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <select
          className="input"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="delivery">Delivery Agent</option>
          <option value="cook">Kitchen Staff (Cook)</option>
          <option value="manager">Manager</option>
        </select>
        <button className="btn-primary sm:col-span-2">+ Create Staff Account</button>
      </form>

      {Object.entries(grouped).map(([role, members]) => (
        <section key={role} className="mb-6">
          <h2 className="mb-2 font-display text-lg font-bold">{ROLE_LABELS[role]}s</h2>
          <div className="card divide-y divide-neutral-100">
            {members.length === 0 && (
              <p className="p-4 text-sm text-neutral-500">No {role} accounts yet.</p>
            )}
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-xs text-neutral-500">📞 {m.phone}</p>
                </div>
                <button
                  onClick={() => toggleActive(m)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    m.is_active
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300'
                  }`}
                >
                  {m.is_active ? 'Active' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
