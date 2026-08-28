import { Link } from 'react-router-dom'
import { SHOP } from '../constants'

/**
 * Single source of truth for the shop's address and phone.
 * Renders on every public page (customer-facing only — admin/kitchen/delivery
 * have their own focused UIs without a marketing footer).
 */
export default function Footer() {
  return (
    <footer className="mt-12 border-t border-neutral-200 bg-brand-dark text-neutral-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:grid-cols-3">
        {/* Brand + address */}
        <div>
          <p className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <span className="text-2xl">🍕</span> Dorito &amp; Bakery
          </p>
          <p className="mt-2 text-sm text-neutral-400">
            {SHOP.tagline || 'Fresh pizza, baked treats & cool shakes — delivered to your door.'}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-neutral-400">
            📍 {SHOP.address}
          </p>
        </div>

        {/* Call us */}
        <div>
          <p className="font-semibold text-white">📞 Call us</p>
          <ul className="mt-2 space-y-1 text-sm">
            {SHOP.phones.map((p) => (
              <li key={p}>
                <a href={`tel:${p}`} className="hover:text-brand-gold">
                  +91 {p}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            Order by phone or WhatsApp
          </p>
        </div>

        {/* Quick links */}
        <div>
          <p className="font-semibold text-white">Quick links</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Link to="/" className="hover:text-brand-gold">Menu</Link></li>
            <li><Link to="/track" className="hover:text-brand-gold">Track Order</Link></li>
            <li><Link to="/cart" className="hover:text-brand-gold">Cart</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-3 text-center text-xs text-neutral-500">
          © {new Date().getFullYear()} {SHOP.name} · Made with{' '}
          <span className="text-red-400">♥</span> by{' '}
          <a
            href="https://publicstack.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-gold hover:underline"
          >
            PublicStack
          </a>
        </p>
      </div>
    </footer>
  )
}
