import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import api from '../api/client'
import { usePolling } from '../hooks'

/**
 * ShopContext — exposes the public shop status (is_shop_open, closed_message)
 * to the entire customer-facing app.
 *
 * Polls /api/settings every 60 s so the open/closed toggle made by the
 * manager (in /admin/settings) is reflected on customer screens within a
 * minute without a full page reload. Manager / staff consoles don't depend
 * on this — they continue using the cart / checkout API directly.
 *
 * The order endpoint also enforces the gate server-side (returns 503), so
 * even an out-of-date UI cannot place a new order when the shop is closed.
 */
const ShopContext = createContext({
  isOpen: true,
  closedMessage: '',
  loaded: false,
  refresh: () => {},
})

const POLL_MS = 60_000

export function ShopProvider({ children }) {
  const [status, setStatus] = useState({ isOpen: true, closedMessage: '' })
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/settings')
      setStatus({
        isOpen: data?.settings?.is_shop_open !== false,
        closedMessage: data?.settings?.closed_message || '',
      })
    } catch {
      /* network blip — keep last known status, never crash the app */
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Polls every 60s, auto-pauses when the tab is hidden.
  usePolling(refresh, POLL_MS)

  return (
    <ShopContext.Provider
      value={{
        isOpen: status.isOpen,
        closedMessage: status.closedMessage,
        loaded,
        refresh,
      }}
    >
      {children}
    </ShopContext.Provider>
  )
}

export const useShopStatus = () => useContext(ShopContext)
