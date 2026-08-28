import { useEffect, useState } from 'react'

/**
 * useCountdown — drive a 1-second countdown that's reset by `start(seconds)`.
 *
 * Used by LoginPage, CheckoutPage, and TrackOrderPage for the OTP resend
 * cooldown. Replaces the 5-line `setInterval` + `clearInterval` inside
 * the state setter that was easy to get wrong (e.g. clearing a stale
 * `t` after the closure had already changed).
 *
 * The countdown is **passive**: it doesn't fire any side effect, just
 * exposes the current value. Components react to the value going <= 0
 * by enabling the "resend" button.
 *
 * @param {number} [initial=0]
 * @returns {[number, (s: number) => void, () => void]}
 */
export function useCountdown(initial = 0) {
  const [remaining, setRemaining] = useState(initial)

  useEffect(() => {
    if (remaining <= 0) return undefined
    const t = setInterval(() => {
      setRemaining((r) => (r <= 1 ? 0 : r - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [remaining])

  return [remaining, setRemaining, () => setRemaining(0)]
}
