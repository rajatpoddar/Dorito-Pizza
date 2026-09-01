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

/** Pick the best hero image for a given menu item (transparent PNG-friendly).
 *
 * Priority is intentionally HERO_IMAGES > item.image_url, NOT the other
 * way around. Reason: the /assets/menu/*.png files in the DB are opaque
 * item photos for the menu grid; the /assets/hero/*.png files are the
 * curated marketing slides the shop owner wants on the home page. If we
 * honoured item.image_url first, any item that already had a DB image
 * would silently fall back to the old opaque thumbnail and the new
 * transparent hero slide would never show — exactly the bug reported
 * ("hero png ek baar dikhta hai, fir original item png aa jaata hai").
 */
export function heroImageFor(item) {
  if (!item) return HERO_FALLBACK_SLIDES[0].img
  const key = String(item.name || '').trim().toLowerCase()
  // 1. curated hero PNG (always wins if the name matches one of the 4
  //    curated slides, even when item.image_url is also set).
  if (HERO_IMAGES[key]) return HERO_IMAGES[key]
  // 2. otherwise use the item's own photo (for slides like Chicken Pizza,
  //    Paneer Pizza, etc. that the manager might feature later).
  if (item.image_url) return item.image_url
  // 3. category-based best-effort (pizzas share the Veg Pizza art)
  const cat = String(item.category_name || '').toLowerCase()
  if (cat.includes('pizza')) return HERO_IMAGES['veg pizza']
  return HERO_FALLBACK_SLIDES[0].img
}

export const STATUS_FLOW = [
  { key: 'pending', label: 'Order Placed', icon: '🧾' },
  { key: 'accepted', label: 'Accepted', icon: '✅' },
  { key: 'preparing', label: 'Preparing', icon: '👨‍🍳' },
  { key: 'ready', label: 'Ready', icon: '🍕' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: '🛵' },
  { key: 'delivered', label: 'Delivered', icon: '✅' },
]

export const STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  preparing: 'Preparing',
  ready: 'Ready for Delivery',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
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
 * returns that path; if the item has no image set, it looks up the actual
 * file by item name, falling back to a category default.
 */

// Map of item name (lowercase) → actual file in public/assets/menu/
const ITEM_IMAGE_MAP = {
  // Pizza
  'veg pizza':                'veg-pizza.png',
  'veg sweet corn pizza':     'veg-sweet-corn-pizza.png',
  'baby corn pizza':          'baby-corn-pizza.png',
  'chicken pizza':            'chicken-pizza.png',
  'paneer pizza':             'paneer-pizza.png',
  'chicken extra cheese pizza': 'chicken-extra-cheese-pizza.png',
  'dorito special pizza':     'dorito-special-pizza.png',
  // Burger
  'veg burger':               'veg-burger.png',
  'chicken burger':           'chicken-burger.png',
  'paneer burger':            'paneer-burger.png',
  'chicken cheese burger':    'chicken-cheese-burger.png',
  'paneer cheese burger':     'paneer-cheese-burger.png',
  // Chicken
  'chicken pakoda':           'chicken-pakoda.png',
  'chicken chilli':           'chicken-chilli.png',
  'butter chicken':           'butter-chicken.png',
  'chicken fry':              'chicken-fry.png',
  'chicken 65':               'chicken-65.png',
  'chicken tikka':            'chicken-tikka.png',
  'roasted chicken':          'roasted-chicken.png',
  // Cake & Pasty
  'vanilla pudding':          'vanilla-pudding.png',
  'chocolate pudding':        'chocolate-pudding.png',
  'pasty':                    'pasty.png',
  '1 pound vanilla cake':     '1-pound-vanilla-cake.png',
  '1 pound chocolate cake':   '1-pound-chocolate-cake.png',
  // Coffee & Shake
  'coffee':                   'coffee.png',
  'hot chocolate coffee':     'hot-chocolate-coffee.png',
  'cold coffee':              'cold-coffee.png',
  'strawberry shake':         'strawberry-shake.png',
  'banana shake':             'banana-shake.png',
  // Pasta & Roll
  'veg roll':                 'veg-roll.png',
  'veg pasta':                'veg-pasta.png',
  'chicken roll':             'chicken-roll.png',
  'paneer roll':              'paneer-roll.png',
  'chicken pasta':            'chicken-pasta.png',
}

// Category-level fallback (used when item name isn't in the map)
const CATEGORY_FALLBACK = {
  pizza:          'veg-pizza.png',
  burger:         'veg-burger.png',
  chicken:        'chicken-65.png',
  pasta:          'veg-pasta.png',
  cake:           'vanilla-pudding.png',
  coffee:         'coffee.png',
}

function categoryFallback(item) {
  const cat = (item.category_name || '').toLowerCase()
  if (cat.includes('pizza')) return CATEGORY_FALLBACK.pizza
  if (cat.includes('burger')) return CATEGORY_FALLBACK.burger
  if (cat.includes('chicken')) return CATEGORY_FALLBACK.chicken
  if (cat.includes('pasta') || cat.includes('roll')) return CATEGORY_FALLBACK.pasta
  if (cat.includes('cake') || cat.includes('pasty')) return CATEGORY_FALLBACK.cake
  if (cat.includes('coffee') || cat.includes('shake')) return CATEGORY_FALLBACK.coffee
  return CATEGORY_FALLBACK.pizza
}

export function itemImage(item) {
  // 1) Per-item explicit image (set by admin or via the image picker)
  if (item.image_url) {
    // Accept both "/assets/menu/foo.png" and bare "foo.png"
    return item.image_url.startsWith('/') || item.image_url.startsWith('http')
      ? item.image_url
      : `/assets/menu/${item.image_url}`
  }
  // 2) Look up by item name in the map
  const key = (item.name || '').trim().toLowerCase()
  if (ITEM_IMAGE_MAP[key]) return `/assets/menu/${ITEM_IMAGE_MAP[key]}`
  // 3) Category-level fallback
  return `/assets/menu/${categoryFallback(item)}`
}

export const fmtINR = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`

export const fmtTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : '—'
