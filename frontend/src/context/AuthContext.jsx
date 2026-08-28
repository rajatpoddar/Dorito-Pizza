import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import api, { errMessage } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // restore session on first load
  useEffect(() => {
    const raw = localStorage.getItem('dorito_auth')
    if (!raw) return setLoading(false)
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem('dorito_auth'))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (phone, password) => {
    const res = await api.post('/auth/login', { phone, password })
    localStorage.setItem('dorito_auth', JSON.stringify({ token: res.data.access_token }))
    setUser(res.data.user)
    return res.data.user
  }, [])

  /** WhatsApp OTP login — returns {user, is_new_user} */
  const sendOtp = useCallback(async (phone) => {
    const res = await api.post('/auth/otp/send', { phone })
    return res.data // {sent, debug_otp?, is_new_user}
  }, [])

  const verifyOtp = useCallback(async (phone, code, name) => {
    const res = await api.post('/auth/otp/verify', { phone, code, name })
    localStorage.setItem('dorito_auth', JSON.stringify({ token: res.data.access_token }))
    setUser(res.data.user)
    return { user: res.data.user, isNew: res.data.is_new_user, linked: res.data.linked_orders }
  }, [])

  const register = useCallback(async (payload) => {
    const res = await api.post('/auth/register', payload)
    localStorage.setItem('dorito_auth', JSON.stringify({ token: res.data.access_token }))
    setUser(res.data.user)
    return res.data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('dorito_auth')
    setUser(null)
  }, [])

  /** Update the current user's preferences (e.g. marketing_optin).
   *  PATCHes PUT /api/auth/me/preferences and refreshes local user state. */
  const updatePreferences = useCallback(async (patch) => {
    const res = await api.put('/auth/me/preferences', patch)
    setUser(res.data.user)
    return res.data.user
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">
        Loading…
      </div>
    )
  }

  return (
    <AuthContext.Provider
      value={{ user, login, register, sendOtp, verifyOtp, logout, updatePreferences, errMessage }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
