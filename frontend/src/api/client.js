import axios from 'axios'

/**
 * Axios instance — same-origin /api by default (Vite dev proxy / nginx).
 * For the Android APK build set VITE_API_BASE to the absolute API URL,
 * e.g. VITE_API_BASE=http://192.168.x.x:5000/api npm run build
 */
const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '/api' })

api.interceptors.request.use((config) => {
  const raw = localStorage.getItem('dorito_auth')
  if (raw) {
    try {
      const { token } = JSON.parse(raw)
      if (token) config.headers.Authorization = `Bearer ${token}`
    } catch {
      /* ignore corrupted storage */
    }
  }
  return config
})

/** Uniform error message extraction. */
export function errMessage(error, fallback = 'Something went wrong') {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.detail ||
    (error?.request ? 'Cannot reach the server. Is the backend running?' : fallback)
  )
}

export default api
