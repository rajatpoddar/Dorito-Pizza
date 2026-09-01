import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import AddressPicker from '../../components/AddressPicker'

const LABELS = ['Home', 'Work', 'Hostel', 'Other']
const MAX_ADDRESSES = 5

/**
 * Account / Profile page — for logged-in customers.
 *
 * Shows: name, phone, marketing opt-in toggle, saved addresses.
 */
export default function AccountPage() {
  const { user, updatePreferences, updateProfile, logout } = useAuth()
  const [optin, setOptin] = useState(Boolean(user?.marketing_optin))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // --- name edit state ---
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(user?.name || '')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)

  // --- phone edit state ---
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneValue, setPhoneValue] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpDebug, setOtpDebug] = useState('')
  const [otpStep, setOtpStep] = useState('phone') // 'phone' | 'otp'
  const [phoneSending, setPhoneSending] = useState(false)
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [phoneSaved, setPhoneSaved] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [resendTimer, setResendTimer] = useState(0)

  // --- addresses state ---
  const [addresses, setAddresses] = useState([])
  const [addrLoading, setAddrLoading] = useState(true)
  const [addrError, setAddrError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [addrForm, setAddrForm] = useState({ label: 'Home', full_address: '' })
  const [addrPin, setAddrPin] = useState(null) // Phase 5.3 — P5.13
  const [showAddrMap, setShowAddrMap] = useState(false)
  const [addrSaving, setAddrSaving] = useState(false)

  useEffect(() => {
    setOptin(Boolean(user?.marketing_optin))
  }, [user?.marketing_optin])

  // Reset form when user changes
  useEffect(() => {
    setNameValue(user?.name || '')
  }, [user?.name])

  // Resend countdown
  useEffect(() => {
    if (resendTimer <= 0) return
    const id = setTimeout(() => setResendTimer((t) => t - 1), 1000)
    return () => clearTimeout(id)
  }, [resendTimer])

  const loadAddresses = () => {
    setAddrLoading(true)
    api
      .get('/addresses')
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
    setAddrPin(null)
    setShowAddrMap(false)
    setShowForm(true)
  }

  const openEdit = (addr) => {
    setEditingId(addr.id)
    setAddrForm({ label: addr.label, full_address: addr.full_address })
    // Hydrate the pin if the saved address has coords.
    setAddrPin(addr.lat != null && addr.lng != null ? { lat: addr.lat, lng: addr.lng } : null)
    setShowAddrMap(false)
    setShowForm(true)
  }

  const saveAddress = async (e) => {
    e.preventDefault()
    if (!addrForm.full_address.trim()) return
    setAddrSaving(true)
    setAddrError('')
    try {
      // Phase 5.3 — include map pin (P5.13) if dropped
      const payload = {
        ...addrForm,
        lat: addrPin?.lat ?? null,
        lng: addrPin?.lng ?? null,
      }
      if (editingId) {
        await api.put(`/addresses/${editingId}`, payload)
      } else {
        await api.post('/addresses', payload)
      }
      setShowForm(false)
      setEditingId(null)
      setAddrPin(null)
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

  // --- name handlers ---
  const saveName = async () => {
    if (!nameValue.trim()) return
    setNameSaving(true)
    setError('')
    setNameSaved(false)
    try {
      await updateProfile({ name: nameValue.trim() })
      setEditingName(false)
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    } catch (err) {
      setError(errMessage(err))
    } finally {
      setNameSaving(false)
    }
  }

  // --- phone handlers ---
  const sendUpdateOtp = async () => {
    if (!phoneValue.trim() || phoneValue.trim().length !== 10) {
      setPhoneError('10-digit number daalein')
      return
    }
    setPhoneSending(true)
    setPhoneError('')
    setOtpDebug('')
    try {
      const res = await api.post('/auth/otp/send-update', { phone: phoneValue.trim() })
      setOtpSent(true)
      setOtpStep('otp')
      setResendTimer(60)
      if (res.data.debug_otp) setOtpDebug(res.data.debug_otp)
    } catch (err) {
      setPhoneError(errMessage(err))
    } finally {
      setPhoneSending(false)
    }
  }

  const verifyAndUpdatePhone = async () => {
    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setPhoneError('6-digit OTP daalein')
      return
    }
    setPhoneSaving(true)
    setPhoneError('')
    try {
      await updateProfile({ phone: phoneValue.trim(), otp: otpCode.trim() })
      setEditingPhone(false)
      setPhoneSaved(true)
      setOtpSent(false)
      setOtpStep('phone')
      setOtpCode('')
      setPhoneValue('')
      setOtpDebug('')
      setTimeout(() => setPhoneSaved(false), 2000)
    } catch (err) {
      setPhoneError(errMessage(err))
    } finally {
      setPhoneSaving(false)
    }
  }

  const cancelPhoneEdit = () => {
    setEditingPhone(false)
    setOtpSent(false)
    setOtpStep('phone')
    setPhoneValue('')
    setOtpCode('')
    setPhoneError('')
    setOtpDebug('')
    setResendTimer(0)
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-neutral-600">Please login to view your account.</p>
        <Link to="/login" className="btn-primary mt-4 inline-block">
          Login
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <h1 className="font-display text-2xl font-bold">My Account</h1>

      {/* profile card */}
      <section className="card mt-4 p-5">
        <h2 className="mb-3 font-semibold">Profile</h2>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        {nameSaved && (
          <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            ✅ Name updated
          </p>
        )}
        {phoneSaved && (
          <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            ✅ Phone number updated
          </p>
        )}

        <dl className="divide-y divide-neutral-100 text-sm">
          {/* --- Name --- */}
          <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-neutral-500">Name</dt>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  className="input w-40 py-1 text-sm"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={saveName}
                  disabled={nameSaving}
                  className="text-xs font-semibold text-brand-red hover:underline disabled:opacity-50"
                >
                  {nameSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditingName(false)
                    setNameValue(user.name || '')
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <dd className="font-medium text-neutral-800">{user.name || '—'}</dd>
                <button
                  onClick={() => setEditingName(true)}
                  className="text-xs text-neutral-400 hover:text-brand-red"
                  title="Edit name"
                >
                  ✏️
                </button>
              </div>
            )}
          </div>

          {/* --- Phone --- */}
          <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-neutral-500">Phone</dt>
            {editingPhone ? (
              <div className="flex-1 space-y-2">
                {phoneError && (
                  <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">{phoneError}</p>
                )}
                {otpDebug && (
                  <p className="rounded bg-yellow-50 px-2 py-1 text-xs text-yellow-700">
                    🔑 Dev OTP: <span className="font-mono font-bold">{otpDebug}</span>
                  </p>
                )}
                {otpStep === 'phone' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500">+91</span>
                    <input
                      className="input w-32 py-1 text-sm"
                      placeholder="10-digit number"
                      value={phoneValue}
                      onChange={(e) =>
                        setPhoneValue(e.target.value.replace(/\D/g, '').slice(0, 10))
                      }
                      autoFocus
                    />
                    <button
                      onClick={sendUpdateOtp}
                      disabled={phoneSending}
                      className="text-xs font-semibold text-brand-red hover:underline disabled:opacity-50"
                    >
                      {phoneSending ? 'Sending…' : 'Send OTP'}
                    </button>
                    <button
                      onClick={cancelPhoneEdit}
                      className="text-xs text-neutral-400 hover:text-neutral-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-neutral-500">
                      OTP bhej diya <span className="font-medium">+91 {phoneValue}</span> par
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        className="input w-28 py-1 text-sm font-mono"
                        placeholder="6-digit OTP"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        autoFocus
                        maxLength={6}
                      />
                      <button
                        onClick={verifyAndUpdatePhone}
                        disabled={phoneSaving}
                        className="text-xs font-semibold text-brand-red hover:underline disabled:opacity-50"
                      >
                        {phoneSaving ? 'Verifying…' : 'Verify & Update'}
                      </button>
                      <button
                        onClick={cancelPhoneEdit}
                        className="text-xs text-neutral-400 hover:text-neutral-600"
                      >
                        Cancel
                      </button>
                    </div>
                    <button
                      onClick={sendUpdateOtp}
                      disabled={resendTimer > 0 || phoneSending}
                      className="text-xs text-neutral-400 hover:text-brand-red disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <dd className="font-medium text-neutral-800">+91 {user.phone}</dd>
                <button
                  onClick={() => {
                    setEditingPhone(true)
                    setPhoneValue('')
                    setOtpStep('phone')
                    setOtpSent(false)
                    setOtpCode('')
                    setPhoneError('')
                    setOtpDebug('')
                  }}
                  className="text-xs text-neutral-400 hover:text-brand-red"
                  title="Change phone number"
                >
                  ✏️
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-between gap-4 py-2">
            <dt className="text-neutral-500">Role</dt>
            <dd className="font-medium text-neutral-800 capitalize">{user.role}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-neutral-500">Member since</dt>
            <dd className="font-medium text-neutral-800">
              {user.created_at
                ? new Date(user.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—'}
            </dd>
          </div>
        </dl>
      </section>

      {/* saved addresses */}
      <section className="card mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">📍 Saved Addresses</h2>
          {addresses.length < MAX_ADDRESSES && (
            <button
              onClick={openAdd}
              className="text-sm font-semibold text-brand-red hover:underline"
            >
              + Add New
            </button>
          )}
        </div>
        <p className="mb-3 text-xs text-neutral-500">
          Delivery addresses save karein — checkout pe ek tap se select karein. Max {MAX_ADDRESSES}{' '}
          addresses.
        </p>

        {addrError && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{addrError}</p>
        )}

        {showForm && (
          <form
            onSubmit={saveAddress}
            className="mb-4 rounded-lg border border-brand-red bg-red-50 p-4 space-y-3"
          >
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
            <div>
              <button
                type="button"
                onClick={() => setShowAddrMap((s) => !s)}
                className="text-xs font-semibold text-brand-red hover:underline"
              >
                {showAddrMap ? '🗺️ Map hide karein' : '📍 Map se exact location pin karein'}
              </button>
              {showAddrMap && (
                <div className="mt-2">
                  <AddressPicker
                    value={addrPin}
                    onChange={setAddrPin}
                    onAddress={(displayName) =>
                      setAddrForm((prev) => ({ ...prev, full_address: displayName }))
                    }
                    height="220px"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                }}
                className="btn-secondary flex-1"
              >
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
                {a.label === 'Home'
                  ? '🏠'
                  : a.label === 'Work'
                    ? '💼'
                    : a.label === 'Hostel'
                      ? '🏨'
                      : '📌'}
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
                  <button
                    onClick={() => setDefault(a.id)}
                    className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
                    title="Set as default"
                  >
                    ⭐
                  </button>
                )}
                <button
                  onClick={() => openEdit(a)}
                  className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  onClick={() => deleteAddress(a.id)}
                  className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                  title="Delete"
                >
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
          WhatsApp marketing messages (offers, reorder nudges). Order updates hamesha bhejenge —
          chahe opt-out ho ya nahi.
        </p>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        {saved && (
          <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">✅ Saved</p>
        )}

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
              Offers, festive discounts, aur &quot;7 din se miss kar rahe hain&quot; jaise friendly
              nudges. Max 1-2 messages per week, anti-ban paced.
            </p>
          </div>
          {saving && <span className="text-xs text-neutral-400">Saving…</span>}
        </label>
      </section>

      {/* quick links */}
      <section className="card mt-4 grid grid-cols-2 gap-2 p-3 text-sm sm:flex">
        <Link to="/my-orders" className="btn-secondary !py-2 text-center">
          📦 My Orders
        </Link>
        <button
          onClick={logout}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          Logout
        </button>
      </section>
    </main>
  )
}
