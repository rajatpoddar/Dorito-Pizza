import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { ShopProvider } from './context/ShopContext'
import './index.css'

// ---- PWA: register service worker (after first paint) ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // When a new SW is installed and finishes waiting, the controller
      // changes. Reload once so the page picks up the new bundle + the
      // new CACHE rules (otherwise users keep seeing the old build).
      let reloading = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return
        reloading = true
        window.location.reload()
      })
      // Also poll for updates every hour so returning users get the
      // latest sw.js (which bumps CACHE name and clears old entries).
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    }).catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ShopProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </ShopProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
