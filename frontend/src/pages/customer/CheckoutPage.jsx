import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api, { errMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import { SHOP, SHOP_ADDRESS, fmtINR, itemImage } from '../../constants'

export default function CheckoutPage() {
  const { items, total: cartSubtotal, clear } = useCart()
  const { user, sendOtp, verifyOtp } = useAuth()
  const navigate = useNavigate()

  const [offers, setOffers] = useState([])
  const [offerCode, setOfferCode] = useState('')
  const [form, setForm] = useState({
    customer_name: user?.name || '',
    customer_phone: user?.phone || '',
    delivery_address: '',
    payment_mode: 'cod',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // --- shop settings (delivery charge etc.) ---
  const [settings, setSettings] = useState({
    delivery_charge: 0,
    free_delivery_above: 0,
    min_order_amount: 0,
    gst_percent: 0,
  })

  // --- OTP flow state ---
  const [otpStep, setOtpStep] = useState(null) // null | 'sending' | 'verify'
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [otpBusy, setOtpBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [isNewUser, setIsNewUser] = useState(false)
  // dev-mode: when WhatsApp delivery is not configured, backend returns the
  // OTP in the response and we show it in a banner so the customer can still
  // complete the order.
  const [devOtp, setDevOtp] = useState(null)

  // load active offers + shop settings (delivery charge etc.)
  useEffect(() => {
    api.get('/offers').then((r) => setOffers(r.data.offers)).catch(() => {})
    api
      .get('/settings')
      .then((r) => setSettings(r.data.settings))
      .catch(() => {})
  }, [])

  // ---------- live offer preview (so customer sees discount update before
  // tapping "Place Order"). Re-derives the same math the backend will use
  // so the displayed total matches what gets saved. ----------
  const offerPreview = useMemo(() => {
    const code = (offerCode || '').trim().toUpperCase()
    if (!code) return { ok: false, discount: 0, label: '' }
    const offer = offers.find((o) => (o.code || '').toUpperCase() === code)
    if (!offer) return { ok: false, discount: 0, label: 'Offer code not found' }
    const min = Number(offer.min_order_amount || 0)
    if (cartSubtotal < min) {
      return {
        ok: false,
        discount: 0,
        label: `Minimum order ${fmtINR(min)} required`,
      }
    }
    // Approximate the discount from the public label (e.g. "20% OFF (max ₹100)"
    // or "₹50 OFF"). The real value is recomputed server-side at order time.
    const lbl = offer.amount_label || ''
    let discount = 0
    const pct = lbl.match(/(\d+(?:\.\d+)?)\s*%/i)
    if (pct) {
      const capMatch = lbl.match(/max\s*₹\s*(\d+(?:\.\d+)?)/i)
      const cap = capMatch ? Number(capMatch[1]) : null
      discount = (cartSubtotal * Number(pct[1])) / 100
      if (cap) discount = Math.min(discount, cap)
    } else {
      const flat = lbl.match(/₹\s*(\d+(?:\.\d+)?)/i)
      if (flat) discount = Number(flat[1])
    }
    discount = Math.min(discount, cartSubtotal)
    return { ok: true, discount, label: lbl, title: offer.title }
  }, [offerCode, offers, cartSubtotal])

  // ---------- totals breakdown ----------
  const discount = offerPreview.ok ? offerPreview.discount : 0
  const qualifiesFree = settings.free_delivery_above > 0 &&
    cartSubtotal - discount >= settings.free_delivery_above
  const deliveryCharge = qualifiesFree || !settings.delivery_charge
    ? 0
    : Number(settings.delivery_charge)
  const total = Math.max(0, cartSubtotal - discount + deliveryCharge)

  // cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) clearInterval(t)
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [cooldown])

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">Nothing to checkout</h1>
        <Link to="/" className="btn-primary mt-6">Browse Menu</Link>
      </main>
    )
  }

  // ---- User clicks "Place Order" ----
  const handlePlaceOrder = async (e) => {
    e.preventDefault()
    setError('')

    if (user) {
      await placeOrder()
    } else {
      await startOtpFlow()
    }
  }

  // ---- OTP: send ----
  const startOtpFlow = async () => {
    if (!form.customer_phone || form.customer_phone.length !== 10) {
      setError('Pehle 10-digit mobile number daalein')
      return
    }
    setOtpStep('sending')
    setOtpError('')
    setOtpCode('')
    setDevOtp(null)
    try {
      const res = await sendOtp(form.customer_phone)
      setIsNewUser(Boolean(res.is_new_user))
      // backend only returns debug_otp when WhatsApp is not configured (dev)
      if (res.debug_otp) setDevOtp(res.debug_otp)
      // Warn early if backend says delivery is already failing — saves the
      // user from waiting 30s+ only to see "OTP nahi aaya".
      if (res.wa_status === 'failed' || res.wa_status === 'skipped') {
        setOtpError(
          'OTP bhej nahi pa rahe. Kuch minute me try karein, ya shop ko call karein.'
        )
      }
      setOtpStep('verify')
      // Match backend OTP_RESEND_COOLDOWN (90s in config). UI just counts
      // down from 90 — if backend rejects, the error message shows the
      // real remaining seconds.
      setCooldown(90)
    } catch (err) {
      setOtpError(errMessage(err))
      setOtpStep(null)
    }
  }

  // ---- OTP: verify + place order ----
  const handleOtpVerify = async (e) => {
    e.preventDefault()
    setOtpBusy(true)
    setOtpError('')
    try {
      // name was already collected in the checkout form (above) — never ask twice.
      // Only send it for new users; existing users keep their saved name.
      const name = isNewUser ? (form.customer_name || '').trim() : undefined
      await verifyOtp(form.customer_phone, otpCode, name)
      await placeOrder()
    } catch (err) {
      setOtpError(errMessage(err))
    } finally {
      setOtpBusy(false)
    }
  }

  // ---- Place the order ----
  const placeOrder = async () => {
    setBusy(true)
    setError('')
    try {
      const payload = {
        ...form,
        offer_code: offerCode,
        items: items.map((i) => ({ menu_item_id: i.id, quantity: i.quantity, name: i.name })),
      }
      const res = await api.post('/orders', payload)
      clear()
      navigate(`/track/${res.data.order.id}`)
    } catch (err) {
      setError(errMessage(err, 'Could not place the order'))
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <h1 className="mb-4 font-display text-2xl font-bold">Checkout</h1>

      {/* order summary */}
      <div className="card mb-4 p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-500">
          Order Summary
        </h2>
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 py-2">
            <img
              src={itemImage(i)}
              alt={i.name}
              className="h-10 w-10 shrink-0 rounded-md object-cover"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = '/assets/menu/placeholder.png'
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-800">
                {i.name}
              </p>
              <p className="text-xs text-neutral-500">
                {fmtINR(i.price)} × {i.quantity}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold">
              {fmtINR(i.price * i.quantity)}
            </span>
          </div>
        ))}

        {/* live total breakdown */}
        <div className="mt-2 space-y-1 border-t pt-2 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-600">Subtotal</span>
            <span>{fmtINR(cartSubtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>🎁 Offer {offerCode} ({offerPreview.label})</span>
              <span>− {fmtINR(discount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-neutral-600">
              🛵 Delivery
              {qualifiesFree && (
                <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-green-700">
                  Free
                </span>
              )}
            </span>
            <span>
              {deliveryCharge === 0 ? (
                <span className="text-green-600">FREE</span>
              ) : (
                fmtINR(deliveryCharge)
              )}
            </span>
          </div>
          {settings.free_delivery_above > 0 && !qualifiesFree && (
            <p className="text-right text-[11px] text-neutral-500">
              Free delivery on orders above {fmtINR(settings.free_delivery_above)}
            </p>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-bold">
            <span>Total</span>
            <span>{fmtINR(total)}</span>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  OTP verification (not logged in)                            */}
      {/* ============================================================ */}
      {otpStep && (
        <div className="card mb-4 border-2 border-brand-gold p-5">
          {otpStep === 'sending' && (
            <div className="flex items-center gap-3 py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-red border-t-transparent" />
              <p className="text-sm text-neutral-600">WhatsApp par OTP bhej rahe hain…</p>
            </div>
          )}

          {otpStep === 'verify' && (
            <form onSubmit={handleOtpVerify} className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold">Verify OTP</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  <b>{form.customer_phone}</b> par OTP bheja gaya hai.
                  {' '}OTP daal ke order place karein.
                </p>
              </div>

              {/* dev-mode banner: shown only when backend returned the OTP inline
                  (i.e. WhatsApp delivery is not configured). Lets the customer
                  complete the order without leaving the app. */}
              {devOtp && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p className="font-semibold">📩 WhatsApp not configured (dev mode)</p>
                  <p className="mt-1">
                    Your OTP:&nbsp;
                    <span className="font-mono text-lg font-bold tracking-widest text-amber-900">
                      {devOtp}
                    </span>
                  </p>
                </div>
              )}

              {/* Production-mode fallback: backend told us WhatsApp delivery
                  failed (timed out / connection closed). Offer a direct call
                  to the shop so the customer isn't stuck. */}
              {!devOtp && otpError && /bhej nahi/i.test(otpError) && (
                <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <p className="font-semibold">⚠️ WhatsApp pe issue aa raha hai</p>
                  <p className="mt-1">
                    Shop ko direct call karein — order place karne me madad mil jayegi:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SHOP.phones.map((p) => (
                      <a
                        key={p}
                        href={`tel:${p}`}
                        className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                      >
                        📞 {p}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <input
                className="input tracking-[0.5em] text-center text-xl font-bold"
                inputMode="numeric"
                placeholder="••••••"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
              />

              {otpError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{otpError}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setOtpStep(null); setOtpError('') }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  disabled={otpBusy || otpCode.length !== 6}
                  className="btn-primary flex-1"
                >
                  {otpBusy ? 'Verifying…' : 'Verify & Place Order'}
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  disabled={cooldown > 0 || otpBusy}
                  onClick={startOtpFlow}
                  className="text-xs font-semibold text-brand-red hover:underline disabled:text-neutral-400 disabled:no-underline"
                >
                  {cooldown > 0 ? `Resend OTP (${cooldown}s)` : 'Resend OTP'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/*  Checkout form                                               */}
      {/* ============================================================ */}
      {!otpStep && (
        <>
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <form onSubmit={handlePlaceOrder} className="card space-y-4 p-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Your Name</label>
              <input
                className="input"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Mobile Number</label>
              <input
                className="input"
                inputMode="numeric"
                placeholder="10-digit mobile number"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Delivery Address</label>
              <textarea
                className="input min-h-[90px]"
                placeholder={`House / street / landmark — ${SHOP_ADDRESS}`}
                value={form.delivery_address}
                onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                required
              />
            </div>

            {/* offers */}
            {(offers.length > 0 || offerCode) && (
              <div>
                <label className="mb-1 block text-sm font-medium">🎁 Offer Code</label>
                <div className="flex gap-2">
                  <input
                    className="input uppercase"
                    placeholder="e.g. DORITO20"
                    value={offerCode}
                    onChange={(e) => setOfferCode(e.target.value.toUpperCase())}
                  />
                  <button type="button" onClick={() => setOfferCode('')}
                          className="btn-secondary !px-3 text-xs">✕</button>
                </div>
                {offers.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {offers.map((o) => (
                      <button key={o.code} type="button" onClick={() => setOfferCode(o.code)}
                              className="rounded-lg border border-dashed border-brand-gold bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                        {o.title} · <b>{o.amount_label}</b>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium">Payment Method</label>
              <div className="grid grid-cols-2 gap-3">
                <PayOption
                  selected={form.payment_mode === 'cod'}
                  onSelect={() => setForm({ ...form, payment_mode: 'cod' })}
                  icon="💵"
                  title="Cash on Delivery"
                  sub="Pay when food arrives"
                />
                <PayOption
                  selected={form.payment_mode === 'upi'}
                  onSelect={() => setForm({ ...form, payment_mode: 'upi' })}
                  icon="📱"
                  title="UPI"
                  sub="GPay / PhonePe / Paytm"
                />
              </div>
              {form.payment_mode === 'upi' && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Pay to the shop UPI after confirming — delivery partner verifies payment on arrival.
                </p>
              )}
            </div>

            <button disabled={busy} className="btn-primary w-full">
              {busy
                ? 'Placing order…'
                : user
                  ? `Place Order · ${fmtINR(total)}`
                  : `Verify OTP & Place Order · ${fmtINR(total)}`}
            </button>
          </form>
        </>
      )}
    </main>
  )
}

function PayOption({ selected, onSelect, icon, title, sub }) {
  return (
    <label
      onClick={onSelect}
      className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-4 text-center transition ${
        selected ? 'border-brand-red bg-red-50' : 'border-neutral-200 hover:border-neutral-300'
      }`}
    >
      <input type="radio" className="hidden" checked={selected} onChange={onSelect} />
      <span className="text-2xl">{icon}</span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-neutral-500">{sub}</span>
    </label>
  )
}
