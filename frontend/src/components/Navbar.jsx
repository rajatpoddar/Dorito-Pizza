import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { HOME_BY_ROLE, ROLE_LABELS } from '../constants'

const STAFF_LINKS = {
  manager: [
    { to: '/admin', label: 'Dashboard' },
    { to: '/admin/orders', label: 'Orders' },
    { to: '/admin/menu', label: 'Menu' },
    { to: '/admin/offers', label: 'Offers' },
    { to: '/admin/marketing', label: 'Marketing' },
    { to: '/admin/analytics', label: 'Analytics' },
    { to: '/admin/staff', label: 'Staff' },
    { to: '/admin/settings', label: 'Settings' },
  ],
  cook: [{ to: '/kitchen', label: 'Kitchen Display' }],
  delivery: [{ to: '/delivery', label: 'My Deliveries' }],
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const { count } = useCart()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const links = user ? STAFF_LINKS[user.role] || [] : []
  const isCustomer = !user || user.role === 'customer'

  const handleLogout = () => {
    logout()
    setDrawerOpen(false)
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 bg-brand-dark text-white shadow-lg">
      <div className="mx-auto flex max-w-6xl items-center gap-x-3 px-4 py-3">
        <Link to={user ? HOME_BY_ROLE[user.role] : '/'} className="flex shrink-0 items-center gap-2">
          <span className="text-2xl">🍕</span>
          <span className="font-display text-lg font-bold leading-tight">
            Dorito <span className="text-brand-gold">&amp; Bakery</span>
            <span className="block text-[10px] font-normal tracking-wide text-neutral-400">
              Palojori · Open
            </span>
          </span>
        </Link>

        {/* desktop nav */}
        <nav className="ml-auto hidden items-center gap-1 text-sm md:flex">
          {isCustomer && (
            <>
              <NavLink to="/" end className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-white/10 text-brand-gold' : 'hover:bg-white/10'}`}>Menu</NavLink>
              <NavLink to="/track" className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-white/10 text-brand-gold' : 'hover:bg-white/10'}`}>Track Order</NavLink>
            </>
          )}

          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end
              className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-white/10 text-brand-gold' : 'hover:bg-white/10'}`}>
              {l.label}
            </NavLink>
          ))}

          {isCustomer && (
            <NavLink to="/cart"
              className={({ isActive }) =>
                `relative flex items-center gap-1.5 rounded-lg px-3 py-2 ${
                  isActive ? 'bg-white/10 text-brand-gold' : 'hover:bg-white/10'
                }`}>
              <span>🛒</span><span>Cart</span>
              {count > 0 && (
                <span aria-label={`${count} item in cart`}
                  className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-red px-1.5 text-[11px] font-bold text-white">
                  {count}
                </span>
              )}
            </NavLink>
          )}

          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full bg-white/10 px-3 py-1.5 text-xs sm:inline">
                {user.name.split(' ')[0]} · <span className="text-brand-gold">{ROLE_LABELS[user.role]}</span>
              </span>
              <button onClick={handleLogout}
                className="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10">
                Logout
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn-primary !py-2 !text-sm">Login</Link>
          )}
        </nav>

        {/* mobile toggle */}
        <button aria-label="Open menu" onClick={() => setDrawerOpen((o) => !o)}
          className="ml-auto rounded-lg p-2 hover:bg-white/10 md:hidden">
          <span className="block h-0.5 w-6 bg-white mb-1.5" />
          <span className="block h-0.5 w-6 bg-white mb-1.5" />
          <span className="block h-0.5 w-6 bg-white" />
        </button>
      </div>

      {/* mobile drawer */}
      {drawerOpen && (
        <div className="border-t border-white/10 bg-brand-dark md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 text-sm">
            {isCustomer && (
              <>
                <NavLink onClick={() => setDrawerOpen(false)} to="/" end className="rounded-lg px-3 py-2.5 hover:bg-white/10">🍕 Menu</NavLink>
                <NavLink onClick={() => setDrawerOpen(false)} to="/track" className="rounded-lg px-3 py-2.5 hover:bg-white/10">🔍 Track Order</NavLink>
                <NavLink onClick={() => setDrawerOpen(false)} to="/cart" className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/10">
                  <span>🛒 Cart</span>
                  {count > 0 && <span className="rounded-full bg-brand-red px-2 text-xs font-bold">{count}</span>}
                </NavLink>
              </>
            )}
            {links.map((l) => (
              <NavLink key={l.to} onClick={() => setDrawerOpen(false)} to={l.to} end
                className={({ isActive }) => `rounded-lg px-3 py-2.5 ${isActive ? 'bg-white/10 text-brand-gold' : 'hover:bg-white/10'}`}>
                {l.label}
              </NavLink>
            ))}
            <div className="mt-1 border-t border-white/10 pt-2">
              {user ? (
                <button onClick={handleLogout}
                  className="w-full rounded-lg border border-white/20 px-3 py-2.5 text-left text-sm hover:bg-white/10">
                  Logout · {user.name.split(' ')[0]}
                </button>
              ) : (
                <Link onClick={() => setDrawerOpen(false)} to="/login"
                  className="block w-full rounded-lg bg-brand-red px-3 py-2.5 text-center font-semibold text-white">
                  Login
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
