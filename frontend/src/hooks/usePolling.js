import { useEffect, useRef } from 'react'

/**
 * usePolling — run `callback` every `intervalMs`, with safe cleanup.
 *
 * Required by RULES.md §11. The bug it fixes (B2): raw `setInterval`
 * inside useEffect is easy to forget to clear, and gets duplicated
 * silently if the same effect ever mounts twice (e.g. StrictMode in
 * dev, or a future re-mount via key change). This hook:
 *
 *   1. Always returns a cleanup that clears the timer.
 *   2. Tracks the latest callback in a ref so changing the callback
 *      identity does NOT re-create the timer (the polling rhythm stays
 *      steady even if a parent re-renders with a new closure).
 *   3. Pauses when `enabled` is false (e.g. while a modal is open).
 *   4. Pauses when the tab is hidden, and resumes on visibility —
 *      so a backgrounded tab doesn't burn API calls for nothing,
 *      and catches up immediately when the user comes back.
 *
 * @param {() => void | Promise<void>} callback
 * @param {number} intervalMs
 * @param {{ enabled?: boolean, runOnVisible?: boolean }} [opts]
 */
export function usePolling(callback, intervalMs, opts = {}) {
  const { enabled = true, runOnVisible = true } = opts
  const saved = useRef(callback)

  // Always keep the latest callback without re-creating the interval.
  useEffect(() => {
    saved.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return undefined

    let timerId = null
    const tick = () => {
      Promise.resolve(saved.current()).catch(() => {
        /* swallow — components own their error UI */
      })
    }
    const start = () => {
      stop()
      timerId = setInterval(tick, intervalMs)
    }
    const stop = () => {
      if (timerId != null) {
        clearInterval(timerId)
        timerId = null
      }
    }

    start()
    if (runOnVisible && typeof document !== 'undefined') {
      const onVis = () => {
        if (document.hidden) stop()
        else {
          tick() // catch up immediately
          start()
        }
      }
      document.addEventListener('visibilitychange', onVis)
      return () => {
        document.removeEventListener('visibilitychange', onVis)
        stop()
      }
    }
    return stop
  }, [enabled, intervalMs, runOnVisible])
}
