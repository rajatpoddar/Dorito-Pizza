import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { usePolling } from '../hooks'
import { fmtTime } from '../constants'

const ICON_FOR_TYPE = {
  order: '🧾',
  offer: '🎁',
  info: 'ℹ️',
}

const POLL_MS = 15000 // 15s — bells don't need to be instant

/**
 * Notification bell — used in the navbar for every role.
 * Polls /api/notifications every 15s, shows unread count badge,
 * dropdown with last 10 notifications, mark-all-read on open.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const wrapperRef = useRef(null)

  const load = useCallback(() => {
    api
      .get('/notifications')
      .then((r) => {
        setItems(r.data.notifications || [])
        setUnread(r.data.unread || 0)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])
  usePolling(load, POLL_MS)

  // Mark all read when dropdown opens (one-shot)
  useEffect(() => {
    if (open && unread > 0) {
      api.post('/notifications/read').catch(() => {})
      setUnread(0)
      setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    }
  }, [open, unread])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 hover:bg-white/10"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span
            aria-label={`${unread} unread`}
            className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white animate-pulse"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-2xl">
          <div className="border-b border-neutral-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Notifications
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-neutral-500">
              Koi notification nahi 🐣
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-neutral-100">
              {items.slice(0, 10).map((n) => (
                <li key={n.id}>
                  {n.order_id ? (
                    <Link
                      to="/admin/orders"
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 hover:bg-neutral-50"
                    >
                      <NotificationRow n={n} />
                    </Link>
                  ) : (
                    <div className="block px-3 py-2">
                      <NotificationRow n={n} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function NotificationRow({ n }) {
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 text-base">{ICON_FOR_TYPE[n.type] || '•'}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${n.read ? 'text-neutral-700' : 'font-semibold text-neutral-900'}`}>
          {n.title}
        </p>
        {n.body && (
          <p className="mt-0.5 text-xs text-neutral-500 line-clamp-2">{n.body}</p>
        )}
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
          {fmtTime(n.created_at)}
        </p>
      </div>
      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-red" />}
    </div>
  )
}