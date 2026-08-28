/** Shared order-status + role constants and display helpers. */

export const SHOP_ADDRESS = 'Jamtara Road, Palojori, Deoghar, Jharkhand 814146'

export const SHOP = {
  name: 'Dorito Pizza and Bakery',
  address: SHOP_ADDRESS,
  phones: ['6202965250', '9939794303'],
  tagline: 'Fresh pizza, baked treats & cool shakes — delivered to your door.',
}

/** Emoji shown next to a category name (used on menu + admin). */
export const CATEGORY_EMOJI = {
  'Pizza':           '🍕',
  'Burger':          '🍔',
  'Cake and Pasty':  '🍰',
  'Chicken Item':    '🍗',
  'Coffee and Shake':'🥤',
  'Pasta and Roll':  '🍝',
}

/** Hero slide images (transparent PNGs, served from /public/assets/hero/).
 *  Used by HeroCarousel when the menu item has no image_url. The keys are
 *  matched case-insensitively against MenuItem.name; values are public paths
 *  that Vite copies as-is. To add more: drop the PNG in
 *  frontend/public/assets/hero/ and add an entry here.
 */
export const HERO_IMAGES = {
  'dorito special pizza':   '/assets/hero/special.png',
  'special pizza':          '/assets/hero/special.png',
  'veg pizza':              '/assets/hero/veg.png',
  'veg sweet corn pizza':   '/assets/hero/sweetcorn.png',
  'sweet corn pizza':       '/assets/hero/sweetcorn.png',
  'baby corn pizza':        '/assets/hero/babycorn.png',
}

/** Default slides shown when the menu has no image_url and no name matches
 *  HERO_IMAGES. These guarantee the hero always looks alive even on a
 *  brand-new menu. Eyebrow / title / subtitle are slide copy. */
export const HERO_FALLBACK_SLIDES = [
  {
    id: 'fallback-veg',
    img: '/assets/hero/veg.png',
    eyebrow: '🔥 Best Seller',
    title: 'Veg Pizza',
    subtitle: 'Classic veg delight, hand-tossed and baked to order.',
    bg: 'from-rose-600 via-red-500 to-amber-400',
    price: 120,
  },
  {
    id: 'fallback-special',
    img: '/assets/hero/special.png',
    eyebrow: '⭐ Chef Special',
    title: 'Dorito Special Pizza',
    subtitle: "Our signature — extra cheese, secret sauce, customer's #1 pick.",
    bg: 'from-amber-500 via-orange-500 to-red-500',
    price: 180,
  },
  {
    id: 'fallback-sweetcorn',
    img: '/assets/hero/sweetcorn.png',
    eyebrow: '🌽 Sweet & Savory',
    title: 'Veg Sweet Corn Pizza',
    subtitle: 'Juicy sweet corn on a mozzarella-loaded crust.',
    bg: 'from-pink-500 via-rose-400 to-amber-300',
    price: 130,
  },
  {
    id: 'fallback-babycorn',
    img: '/assets/hero/babycorn.png',
    eyebrow: '🌱 Crunchy Bite',
    title: 'Baby Corn Pizza',
    subtitle: 'Crisp baby corn, bell peppers, herbs and cheese.',
    bg: 'from-emerald-600 via-teal-500 to-amber-400',
    price: 140,
  },
]

/** Pick the best hero image for a given menu item (transparent PNG-friendly). */
export function heroImageFor(item) {
  if (!item) return HERO_FALLBACK_SLIDES[0].img
  // 1. honour the DB-set image_url if present
  if (item.image_url) return item.image_url
  // 2. try a name match in HERO_IMAGES
  const key = String(item.name || '').trim().toLowerCase()
  if (HERO_IMAGES[key]) return HERO_IMAGES[key]
  // 3. by category — best-effort visual identity
  const cat = String(item.category_name || '').toLowerCase()
  if (cat.includes('pizza')) return HERO_IMAGES['veg pizza']
  return HERO_FALLBACK_SLIDES[0].img
}

export const STATUS_FLOW = [
  { key: 'pending', label: 'Order Placed', icon: '🧾' },
  { key: 'preparing', label: 'Preparing', icon: '👨‍🍳' },
  { key: 'ready', label: 'Ready', icon: '🍕' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: '🛵' },
  { key: 'delivered', label: 'Delivered', icon: '✅' },
]

export const STATUS_LABELS = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready for Delivery',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  preparing: 'bg-blue-100 text-blue-800 border-blue-200',
  ready: 'bg-violet-100 text-violet-800 border-violet-200',
  out_for_delivery: 'bg-sky-100 text-sky-800 border-sky-200',
  delivered: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
}

export const ROLE_LABELS = {
  customer: 'Customer',
  manager: 'Manager',
  cook: 'Kitchen Staff',
  delivery: 'Delivery Agent',
}

/** Route each role lands on after login. */
export const HOME_BY_ROLE = {
  customer: '/',
  manager: '/admin',
  cook: '/kitchen',
  delivery: '/delivery',
}

/**
 * Menu item artwork lives in /assets/menu/ as kebab-case PNGs.
 *
 * The image filename is stored on the menu item itself (image_url), set by
 * the admin via the image picker or by the seed script. This function
 * returns that path; if the item has no image set, it falls back to a
 * per-category bucket PNG so the menu never shows a broken image.
 */
const FALLBACK_BUCKETS = {
  pizza: 7, burger: 5, chicken: 7, pasta: 5, cake: 5, coffee: 5,
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function bucketFor(item) {
  const cat = slugify(item.category_name || '')
  if (cat.includes('pizza')) return 'pizza'
  if (cat.includes('burger')) return 'burger'
  if (cat.includes('chicken')) return 'fried_food'
  if (cat.includes('pasta') || cat.includes('roll') || cat.includes('wrap')) return 'pasta_wrap'
  if (cat.includes('cake') || cat.includes('pasty') || cat.includes('dessert')) return 'dessert'
  if (cat.includes('coffee') || cat.includes('shake') || cat.includes('drink')) return 'drink'
  return 'pizza'
}

export function itemImage(item) {
  // 1) Per-item explicit image (set by admin or via the image picker)
  if (item.image_url) {
    // Accept both "/assets/menu/foo.png" and bare "foo.png"
    return item.image_url.startsWith('/') || item.image_url.startsWith('http')
      ? item.image_url
      : `/assets/menu/${item.image_url}`
  }
  // 2) Fallback: per-category bucket PNG
  const bucket = bucketFor(item)
  const n = FALLBACK_BUCKETS[bucket] || 5
  const idx = ((Number(item.id) || 1) - 1) % n + 1
  return `/assets/menu/${bucket}_${String(idx).padStart(2, '0')}.png`
}

export const fmtINR = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`

export const fmtTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : '—'
