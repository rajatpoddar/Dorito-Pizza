import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { errMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useCountdown } from '../../hooks'
import { HOME_BY_ROLE } from '../../constants'

export default function LoginPage() {
  const { login, sendOtp, verifyOtp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Default to staff login — this page is meant for staff. Customers can
  // log in from the checkout page or the Track Order page (both do OTP
  // inline), so they don't need a dedicated /login screen.
  const [mode, setMode] = useState('staff')          // staff | otp
  const [step, setStep] = useState('phone')          // phone | code (OTP flow)
  const [form, setForm] = useState({ phone: '', password: '', name: '', otp: '' })
  const [isNew, setIsNew] = useState(false)
  const [devOtp, setDevOtp] = useState(null)
  const [cooldown, setCooldown] = useCountdown(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const goHome = (user) =>
    navigate(location.state?.from || HOME_BY_ROLE[user.role] || '/', { replace: true })

  const startCooldown = () => {
    setCooldown(90)
  }

  const handleSendOtp = async (e) => {
    e?.preventDefault && e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await sendOtp(form.phone)
      setIsNew(Boolean(res.is_new_user))
      setDevOtp(res.debug_otp || null)
      setStep('code')
      startCooldown()
    } catch (err) {
      setError(errMessage(err))
    } finally { setBusy(false) }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const { user } = await verifyOtp(form.phone, form.otp, form.name)
      goHome(user)
    } catch (err) {
      setError(errMessage(err))
    } finally { setBusy(false) }
  }

  const handleStaffLogin = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const user = await login(form.phone, form.password)
      goHome(user)
    } catch (err) {
      setError(errMessage(err))
    } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col px-4 pb-16 pt-10">
      <div className="card p-6">
        {/* mode tabs */}
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1">
          <TabBtn active={mode === 'staff'} onClick={() => { setMode('staff'); setError('') }}>
            🧑‍🍳 Staff
          </TabBtn>
          <TabBtn active={mode === 'otp'} onClick={() => { setMode('otp'); setError('') }}>
            👤 Customer (OTP)
          </TabBtn>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {mode === 'otp' && step === 'code' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <h1 className="font-display text-2xl font-bold">OTP daalein</h1>
              <p className="mt-1 text-sm text-neutral-500">
                <b>{form.phone}</b> par WhatsApp OTP bheja gaya hai
              </p>
            </div>

            {devOtp && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                🔧 Dev mode (WhatsApp key set nahi): OTP = <b>{devOtp}</b>
              </p>
            )}

            <input className="input tracking-[0.5em] text-center text-xl font-bold" inputMode="numeric"
                   placeholder="••••••" maxLength={6}
                   value={form.otp}
                   onChange={(e) => setForm({ ...form, otp: e.target.value.replace(/\D/g, '') })} required />

            {isNew && (
              <div>
                <label className="mb-1 block text-sm font-medium">Aapka naam? <span className="text-xs text-neutral-400">(naya account)</span></label>
                <input className="input" placeholder="e.g. Ravi Kumar"
                       value={form.name}
                       onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            )}

            <button disabled={busy || form.otp.length !== 6} className="btn-primary w-full">
              {busy ? 'Verify…' : 'Verify & Login'}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => setStep('phone')} className="text-neutral-500 hover:underline">
                ← Number badlein
              </button>
              <button type="button" disabled={cooldown > 0 || busy}
                      onClick={handleSendOtp}
                      className="font-semibold text-brand-red hover:underline disabled:text-neutral-400 disabled:no-underline">
                {cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend OTP'}
              </button>
            </div>
          </form>
        )}

        {mode === 'otp' && step === 'phone' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <h1 className="font-display text-2xl font-bold">Customer Login</h1>
              <p className="mt-1 text-sm text-neutral-500">
                Mobile number se WhatsApp OTP aayega. New users ka account auto-create ho jayega.
              </p>
            </div>
            <input className="input" inputMode="numeric" placeholder="10-digit mobile number"
                   value={form.phone}
                   onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                   autoFocus required />
            <button disabled={busy || form.phone.length !== 10} className="btn-primary w-full">
              {busy ? 'OTP bhej rahe hain…' : 'Send OTP'}
            </button>
            <p className="text-center text-xs text-neutral-500">
              💡 Aap <Link to="/track" className="font-semibold text-brand-red hover:underline">Track Order</Link> page se bhi login kar sakte hain.
            </p>
          </form>
        )}

        {mode === 'staff' && (
          <form onSubmit={handleStaffLogin} className="space-y-4">
            <div>
              <h1 className="font-display text-2xl font-bold">Staff Login</h1>
              <p className="mt-1 text-sm text-neutral-500">Manager · Kitchen · Delivery — password se login karein</p>
            </div>
            <input className="input" inputMode="numeric" placeholder="Mobile number"
                   value={form.phone}
                   onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                   required />
            <input className="input" type="password" placeholder="Password"
                   value={form.password}
                   onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <button disabled={busy} className="btn-primary w-full">
              {busy ? 'Logging in…' : 'Login'}
            </button>

            <details className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              <summary className="cursor-pointer font-semibold text-neutral-700">Demo credentials</summary>
              <ul className="mt-2 space-y-1 font-mono text-[11px]">
                <li>Manager  — 6202965250 / Manager@123</li>
                <li>Cook     — 9939794303 / Cook@123</li>
                <li>Delivery — 9000000001 / Agent@123</li>
              </ul>
            </details>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-neutral-400">
          Login karne par pehle ke saare orders automatically dikhenge 😉
        </p>
      </div>
    </main>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? 'bg-white shadow text-brand-dark' : 'text-neutral-500 hover:text-neutral-700'}`}>
      {children}
    </button>
  )
}