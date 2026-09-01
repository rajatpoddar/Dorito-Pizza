import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

const LABELS = ['Home', 'Work', 'Hostel', 'Other']
const MAX_ADDRESSES = 5

/**
 * Account / Profile page — for logged-in customers.
 *
 * Shows: name, phone, marketing opt-in toggle, saved addresses.
 */
export default function AccountPage() {
  const { user, updatePreferences, logout } = useAuth()
  const [optin, setOptin] = useState(Boolean(user?.marketing_optin))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // --- addresses state ---
  const [addresses, setAddresses] = useState([])
  const [addrLoading, setAddrLoading] = useState(true)
  const [addrError, setAddrError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [addrForm, setAddrForm] = useState({ label: 'Home', full_address: '' })
  const [addrSaving, setAddrSaving] = useState(false)

  useEffect(() => {
    setOptin(Boolean(user?.marketing_optin))
  }, [user?.marketing_optin])

  const loadAddresses = () => {
    setAddrLoading(true)
    api.get('/addresses')
      .then((r) => setAddresses(r.data.addresses))
      .catch((e) => setAddrError(errMessage(e)))
      .finally(() => setAddrLoading(false))
  }

  useEffect(() => {
    if (user) loadAddresses()
  }, [user])

  const onToggle = async (e) => {
    const next = e.target.checked
    setOptin(next)
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await updatePreferences({ marketing_optin: next })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (err) {
      setError(errMessage(err))
      setOptin(!next)
    } finally {
      setSaving(false)
    }
  }

  // --- address handlers ---
  const openAdd = () => {
    setEditingId(null)
    setAddrForm({ label: 'Home', full_address: '' })
    setShowForm(true)
  }

  const openEdit = (addr) => {
    setEditingId(addr.id)
    setAddrForm({ label: addr.label, full_address: addr.full_address })
    setShowForm(true)
  }

  const saveAddress = async (e) => {
    e.preventDefault()
    if (!addrForm.full_address.trim()) return
    setAddrSaving(true)
    setAddrError('')
    try {
      if (editingId) {
        await api.put(`/addresses/${editingId}`, addrForm)
      } else {
        await api.post('/addresses', addrForm)
      }
      setShowForm(false)
      setEditingId(null)
      loadAddresses()
    } catch (err) {
      setAddrError(errMessage(err))
    } finally {
      setAddrSaving(false)
    }
  }

  const deleteAddress = async (id) => {
    if (!window.confirm('Delete this address?')) return
    try {
      await api.delete(`/addresses/${id}`)
      loadAddresses()
    } catch (err) {
      setAddrError(errMessage(err))
    }
  }

  const setDefault = async (id) => {
    try {
      await api.patch(`/addresses/${id}/default`)
      loadAddresses()
    } catch (err) {
      setAddrError(errMessage(err))
    }
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-neutral-600">Please login to view your account.</p>
        <Link to="/login" className="btn-primary mt-4 inline-block">Login</Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <h1 className="font-display text-2xl font-bold">My Account</h1>

      {/* profile card */}
      <section className="card mt-4 p-5">
        <h2 className="mb-3 font-semibold">Profile</h2>
        <dl className="divide-y divide-neutral-100 text-sm">
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-neutral-500">Name</dt>
            <dd className="font-medium text-neutral-800">{user.name || '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-neutral-500">Phone</dt>
            <dd className="font-medium text-neutral-800">+91 {user.phone}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-neutral-500">Role</dt>
            <dd className="font-medium text-neutral-800 capitalize">{user.role}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-neutral-500">Member since</dt>
            <dd className="font-medium text-neutral-800">
              {user.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
              }) : '—'}
            </dd>
          </div>
        </dl>
      </section>

      {/* saved addresses */}
      <section className="card mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">📍 Saved Addresses</h2>
          {addresses.length < MAX_ADDRESSES && (
            <button onClick={openAdd} className="text-sm font-semibold text-brand-red hover:underline">
              + Add New
            </button>
          )}
        </div>
        <p className="mb-3 text-xs text-neutral-500">
          Delivery addresses save karein — checkout pe ek tap se select karein.
          Max {MAX_ADDRESSES} addresses.
        </p>

        {addrError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{addrError}</p>}

        {showForm && (
          <form onSubmit={saveAddress} className="mb-4 rounded-lg border border-brand-red bg-red-50 p-4 space-y-3">
            <h3 className="text-sm font-bold">{editingId ? 'Edit Address' : 'New Address'}</h3>
            <div>
              <label className="mb-1 block text-xs font-medium">Label</label>
              <div className="flex flex-wrap gap-2">
                {LABELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setAddrForm({ ...addrForm, label: l })}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      addrForm.label === l
                        ? 'border-brand-red bg-red-100 text-red-700'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    {l === 'Home' ? '🏠' : l === 'Work' ? '💼' : l === 'Hostel' ? '🏨' : '📌'} {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Full Address</label>
              <textarea
                className="input min-h-[80px]"
                placeholder="House / flat no., street, landmark, area..."
                value={addrForm.full_address}
                onChange={(e) => setAddrForm({ ...addrForm, full_address: e.target.value })}
                required
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null) }} className="btn-secondary flex-1">
                Cancel
              </button>
              <button disabled={addrSaving} className="btn-primary flex-1 disabled:opacity-50">
                {addrSaving ? 'Saving…' : editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </form>
        )}

        {addrLoading && <p className="text-sm text-neutral-500">Loading addresses…</p>}

        {!addrLoading && addresses.length === 0 && !showForm && (
          <p className="py-4 text-center text-sm text-neutral-400">
            No saved addresses yet. Add one for faster checkout!
          </p>
        )}

        <div className="space-y-2">
          {addresses.map((a) => (
            <div
              key={a.id}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                a.is_default ? 'border-brand-red bg-red-50' : 'border-neutral-200'
              }`}
            >
              <span className="mt-0.5 text-lg">
                {a.label === 'Home' ? '🏠' : a.label === 'Work' ? '💼' : a.label === 'Hostel' ? '🏨' : '📌'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-neutral-800">{a.label}</p>
                  {a.is_default && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">
                      Default
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-neutral-600">{a.full_address}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {!a.is_default && (
                  <button onClick={() => setDefault(a.id)} className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100" title="Set as default">
                    ⭐
                  </button>
                )}
                <button onClick={() => openEdit(a)} className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100" title="Edit">
                  ✏️
                </button>
                <button onClick={() => deleteAddress(a.id)} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50" title="Delete">
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* preferences card */}
      <section className="card mt-4 p-5">
        <h2 className="mb-1 font-semibold">Preferences</h2>
        <p className="mb-3 text-xs text-neutral-500">
          WhatsApp marketing messages (offers, reorder nudges). Order updates
          hamesha bhejenge — chahe opt-out ho ya nahi.
        </p>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {saved && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">✅ Saved</p>}

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50">
          <input
            type="checkbox"
            checked={optin}
            disabled={saving}
            onChange={onToggle}
            className="mt-0.5 h-5 w-5 cursor-pointer accent-brand-red"
          />
          <div className="flex-1">
            <p className="text-sm font-semibold text-neutral-800">
              📣 WhatsApp marketing messages allow karein
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Offers, festive discounts, aur &quot;7 din se miss kar rahe hain&quot; jaise
              friendly nudges. Max 1-2 messages per week, anti-ban paced.
            </p>
          </div>
          {saving && <span className="text-xs text-neutral-400">Saving…</span>}
        </label>
      </section>

      {/* quick links */}
      <section className="card mt-4 grid grid-cols-2 gap-2 p-3 text-sm sm:flex">
        <Link to="/my-orders" className="btn-secondary !py-2 text-center">📦 My Orders</Link>
        <button onClick={logout} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
          Logout
        </button>
      </section>
    </main>
  )
}
