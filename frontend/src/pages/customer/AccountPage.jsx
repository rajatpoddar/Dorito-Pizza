import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { errMessage } from '../../api/client'

/**
 * Account / Profile page — for logged-in customers.
 *
 * Shows: name, phone, marketing opt-in toggle (P3.6).
 * Future: address book, change-password, loyalty points (P5.9).
 */
export default function AccountPage() {
  const { user, updatePreferences, logout } = useAuth()
  const [optin, setOptin] = useState(Boolean(user?.marketing_optin))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setOptin(Boolean(user?.marketing_optin))
  }, [user?.marketing_optin])

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
      // revert local UI on failure
      setOptin(!next)
    } finally {
      setSaving(false)
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
