import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api, { errMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useCountdown, usePolling } from '../../hooks'
import OrderStatusTracker from '../../components/OrderStatusTracker'
import StatusBadge from '../../components/StatusBadge'
import { fmtINR, fmtTime } from '../../constants'

const POLL_MS = 5000 // live tracking refresh

/* ------------------------------------------------------------------ */
/*  Main component — switches between logged-in list view and guest   */
/* ------------------------------------------------------------------ */
export default function TrackOrderPage() {
  const { user } = useAuth()
  const { orderId } = useParams()

  // Logged in + no specific orderId → show order list
  if (user && !orderId) return <OrderList />
  // Logged in + specific orderId → live tracking
  if (user && orderId) return <LiveTracking />
  // Guest → phone + OTP login
  return <GuestLookup />
}


/* ================================================================== */
/*  1. Logged-in user: list of their orders                           */
/* ================================================================== */
function OrderList() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/orders/my')
      .then((res) => setOrders(res.data.orders))
      .catch((e) => setError(errMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading)
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center text-neutral-500">
        Loading your orders…
      </main>
    )
  if (error)
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center text-red-500">
        {error}
      </main>
    )

  if (orders.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-5xl">📭</p>
        <h1 className="mt-4 font-display text-2xl font-bold">Koi order nahi mila</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Abhi kuch order karein — phir yahan track kar sakte hain!
        </p>
        <Link to="/" className="btn-primary mt-6">
          Browse Menu
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <h1 className="mb-4 font-display text-2xl font-bold">Track Your Orders</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Apne orders ka live status dekhein — kisi order par tap karein.
      </p>

      <div className="space-y-3">
        {orders.map((o) => (
          <Link
            key={o.id}
            to={`/track/${o.id}`}
            className="card block p-4 transition hover:border-brand-red"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-brand-dark">{o.order_number}</p>
                <p className="text-xs text-neutral-500">{fmtTime(o.created_at)}</p>
              </div>
              <StatusBadge status={o.status} />
            </div>
            <p className="mt-2 truncate text-sm text-neutral-600">
              {o.items.map((i) => `${i.item_name} ×${i.quantity}`).join(', ')}
            </p>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-neutral-400">
                {o.payment_mode === 'cod' ? '💵 Cash on Delivery' : '📱 UPI'} ·{' '}
                {o.payment_status}
              </span>
              <span className="font-bold">{fmtINR(o.total_amount)}</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}


/* ================================================================== */
/*  2. Live tracking detail (for logged-in user or after guest lookup) */
/* ================================================================== */
function LiveTracking() {
  const { orderId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [resending, setResending] = useState(false)

  const resendOtp = async () => {
    if (!orderId) return
    setResending(true)
    try {
      await api.post(`/orders/${orderId}/otp/resend`)
    } catch (err) {
      setError(errMessage(err))
    } finally {
      setResending(false)
    }
  }

  // live polling
  const fetchOrder = useCallback(() => {
    if (!orderId) return
    api
      .get(`/orders/${orderId}/track`)
      .then((res) => {
        setOrder(res.data.order)
        setError('')
      })
      .catch((e) => {
        if (!order) setError(errMessage(e))
      })
  }, [orderId, order])

  useEffect(() => {
    fetchOrder()
  }, [fetchOrder])

  usePolling(fetchOrder, POLL_MS, { enabled: Boolean(orderId) })

  if (error)
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center text-red-500">
        {error}
        <div className="mt-4">
          <Link to="/track" className="btn-secondary">
            ← Back to orders
          </Link>
        </div>
      </main>
    )
  if (!order)
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center text-neutral-500">
        Loading order…
      </main>
    )

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <div className="mb-3">
        <button onClick={() => navigate('/track')} className="text-sm text-neutral-500 hover:underline">
          ← Back to orders
        </button>
      </div>

      <div className="card mb-4 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-xl font-bold">{order.order_number}</p>
            <p className="text-xs text-neutral-500">Placed {fmtTime(order.created_at)}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm">
          <span className="text-neutral-600">
            {order.payment_mode === 'cod' ? '💵 Cash on Delivery' : '📱 UPI'}
            {order.payment_status === 'paid' && ' · paid ✅'}
          </span>
          <span className="text-lg font-bold">{fmtINR(order.total_amount)}</span>
        </div>

        {/* discount + delivery OTP */}
        {order.discount_amount > 0 && (
          <p className="mt-2 text-xs text-green-600">
            🎉 Offer {order.offer_code} applied — saved {fmtINR(order.discount_amount)}
          </p>
        )}
        {order.reject_reason && (
          <p className="mt-2 text-xs text-red-600">
            ❌ Rejection reason: {order.reject_reason}
          </p>
        )}
        {order.delivery_otp && (
          <div className="mt-3 rounded-xl border-2 border-dashed border-brand-gold bg-amber-50 p-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              🛵 Driver ko ye OTP dikhayein
            </p>
            <p className="my-1 text-3xl font-black tracking-[0.5em] text-brand-dark">
              {order.delivery_otp}
            </p>
            <button
              onClick={resendOtp}
              disabled={resending}
              className="text-xs font-semibold text-amber-800 underline hover:text-amber-600 disabled:opacity-50"
            >
              {resending ? 'Bhej rahe hain…' : 'WhatsApp par OTP bhejein 🔁'}
            </button>
          </div>
        )}
      </div>

      <div className="card mb-4 p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-neutral-500">
          Live Status
        </h2>
        <OrderStatusTracker status={order.status} />
      </div>

      <div className="card p-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-500">
          Order Details
        </h2>
        {order.items.map((i) => (
          <div key={i.id} className="flex justify-between py-1 text-sm">
            <span>
              {i.item_name} <span className="text-neutral-400">× {i.quantity}</span>
            </span>
            <span className="font-semibold">{fmtINR(i.subtotal)}</span>
          </div>
        ))}
        <p className="mt-3 border-t pt-2 text-xs text-neutral-500">
          📍 Deliver to: {order.customer_name} · {order.customer_phone}
          <br />
          {order.delivery_address}
        </p>
        {order.delivery_agent && (
          <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
            🛵 Delivery partner: {order.delivery_agent.name}
          </p>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <Link to="/" className="btn-secondary flex-1">
          Order More
        </Link>
        <Link to="/track" className="btn-secondary flex-1">
          My Orders
        </Link>
      </div>
      <p className="mt-3 text-center text-xs text-neutral-400">
        This page refreshes automatically every few seconds.
      </p>
    </main>
  )
}


/* ================================================================== */
/*  3. Guest lookup — phone + OTP, then they see ALL their orders     */
/* ================================================================== */
function GuestLookup() {
  const { sendOtp, verifyOtp } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('phone')  // phone | code
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useCountdown(0)
  const [devOtp, setDevOtp] = useState(null)

  const requestOtp = async (e) => {
    e?.preventDefault()
    setError('')
    if (!/^\d{10}$/.test(phone)) {
      setError('10-digit mobile number daalein')
      return
    }
    setBusy(true)
    try {
      const res = await sendOtp(phone)
      setIsNew(Boolean(res.is_new_user))
      setDevOtp(res.debug_otp || null)
      setStep('code')
      setCooldown(60)
    } catch (err) {
      setError(errMessage(err, 'OTP bhej nahi paye — kuch minute me koshish karein'))
    } finally {
      setBusy(false)
    }
  }

  const submitOtp = async (e) => {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(code)) {
      setError('6-digit OTP daalein')
      return
    }
    setBusy(true)
    try {
      await verifyOtp(phone, code, name)
      // AuthContext updates → re-render of TrackOrderPage picks up user
      // and swaps GuestLookup for OrderList automatically.
      navigate('/track', { replace: true })
    } catch (err) {
      setError(errMessage(err, 'Galat ya expire OTP. Naya OTP bhejein.'))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'code') {
    return (
      <main className="mx-auto max-w-md px-4 pb-16 pt-6">
        <div className="card p-6">
          <h1 className="font-display text-2xl font-bold">OTP daalein</h1>
          <p className="mt-1 text-sm text-neutral-500">
            <b>{phone}</b> par WhatsApp OTP bheja gaya hai
          </p>
          {devOtp && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              🔧 Dev mode (WhatsApp key set nahi): OTP = <b>{devOtp}</b>
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <form onSubmit={submitOtp} className="mt-5 space-y-4">
            <input
              className="input tracking-[0.5em] text-center text-xl font-bold"
              inputMode="numeric" placeholder="••••••" maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />

            {isNew && (
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Aapka naam? <span className="text-xs text-neutral-400">(naya account)</span>
                </label>
                <input className="input" placeholder="e.g. Ravi Kumar"
                       value={name}
                       onChange={(e) => setName(e.target.value)} />
              </div>
            )}

            <button disabled={busy || code.length !== 6} className="btn-primary w-full">
              {busy ? 'Verify…' : 'Verify & See My Orders'}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button type="button" onClick={() => { setStep('phone'); setError('') }}
                    className="text-neutral-500 hover:underline">
              ← Number badlein
            </button>
            <button type="button" disabled={cooldown > 0 || busy}
                    onClick={requestOtp}
                    className="font-semibold text-brand-red hover:underline disabled:text-neutral-400 disabled:no-underline">
              {cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend OTP'}
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-neutral-500">
            Login ke baad aap apne saare orders ek saath dekh sakte hain — koi order id yaad nahi rakhna.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Track Your Order</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Apna mobile number daalein — WhatsApp par OTP aayega. Verify karte hi saare orders dikh jayenge.
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <form onSubmit={requestOtp} className="mt-5 space-y-4">
          <input
            className="input"
            inputMode="numeric" maxLength={10}
            placeholder="10-digit mobile number"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            autoFocus
            required
          />
          <button disabled={busy} className="btn-primary w-full">
            {busy ? 'OTP bhej rahe hain…' : 'Send OTP'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-neutral-500">
          Manager / Kitchen / Delivery staff?
          <Link to="/login" className="ml-1 font-semibold text-brand-red hover:underline">
            Password login →
          </Link>
        </div>
      </div>
    </main>
  )
}
