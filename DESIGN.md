# 🎨 Design Document - Dorito Pizza and Bakery

> UI / UX system, screens, component library, and visual language for the Dorito
> Pizza and Bakery customer + staff apps. Read alongside `ARCHITECTURE.md` and the
> live components under `frontend/src/components/` and `frontend/src/pages/`.

---

## 1. Brand Identity

| Element | Value |
|---------|-------|
| **Shop name** | Dorito Pizza and Bakery |
| **Tagline** | "Fresh. Fast. Desi-tasty." (proposed) |
| **Address** | Jamatara Road, Palojori, Deoghar, Jharkhand 814146 |
| **Phones** | 6202965250 · 9939794303 |
| **Tone of voice** | Friendly, casual, Desi (Hinglish), family-oriented |
| **Design vibe** | Warm, appetizing, slightly rustic — gold + deep red + charcoal |

### 1.1 Color Palette (Tailwind extension in `tailwind.config.js`)

| Token | Hex | Usage |
|-------|-----|-------|
| `brand-red` | `#e11d2e` | Primary CTAs, headers, brand mark, active states |
| `brand-dark` | `#121212` | Body text, navbar, footer, dark sections |
| `brand-gold` | `#d4af37` | Accent (badges, highlights, "new" / "offer" pills) |
| `brand-goldlight` | `#f0d67c` | Hover / subtle gold backgrounds |
| `white` | `#ffffff` | Card backgrounds, light surfaces |
| `gray-50/100/200/500/700/900` | Tailwind defaults | Hierarchy, dividers, secondary text |

**Contrast rule:** all text on `brand-red` and `brand-dark` MUST be white. All text
on `brand-gold` MUST be `brand-dark` or black. Verified with WCAG AA.

### 1.2 Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display / hero | `font-display` (Georgia, serif fallback) | 700 | 28–48 px |
| H1 page title | `font-display` | 700 | 24–32 px |
| H2 section | system sans | 600 | 18–22 px |
| Body | system sans | 400 | 14–16 px |
| Small / meta | system sans | 500 | 12–13 px |
| Price | `font-display` | 700 | 18–22 px (`brand-red`) |

System sans stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
No web-font download — keeps first paint fast on 3G (budget §5.1 of `PRD.md`).

### 1.3 Iconography

- 🍕 🛵 👨‍🍳 🧾 ✅ — emoji used as status icons in `OrderStatusTracker`.
- No icon library (no FontAwesome / Material) — keeps bundle small.
- SVG illustrations for category tiles (committed in `public/images/menu/`).

### 1.4 Spacing & Radius

- **Base unit:** 4 px (Tailwind default).
- **Section padding:** `p-4` mobile, `p-6` tablet, `p-8` desktop.
- **Card radius:** `rounded-2xl` (16 px) for hero / featured, `rounded-xl` (12 px)
  for menu cards, `rounded-full` for badges / pills.
- **Shadow:** `shadow-sm` for cards at rest, `shadow-md` on hover, `shadow-lg` for
  modals / pop-overs.

---

## 2. Layout & Grid

### 2.1 Breakpoints (Tailwind defaults)

| Name | Min width | Use |
|------|-----------|-----|
| base | 0 | mobile portrait (default) |
| `sm` | 640 px | large phone landscape |
| `md` | 768 px | tablet portrait |
| `lg` | 1024 px | tablet landscape / small laptop |
| `xl` | 1280 px | desktop |
| `2xl` | 1536 px | wide desktop |

Mobile-first: layouts start at 1-column, expand at `md:` to 2-col, `lg:` to 3-col.

### 2.2 Page chrome

Every page sits inside:

```
┌────────────────────────────────────────┐
│  <Navbar />          (sticky top)      │
├────────────────────────────────────────┤
│                                        │
│  <PageContent>                         │
│   max-w-6xl mx-auto px-4               │
│                                        │
├────────────────────────────────────────┤
│  <Footer> (only on customer routes)    │
│  address · phones · © year             │
└────────────────────────────────────────┘
```

- Navbar is **role-aware** (see `components/Navbar.jsx`):
  - customer: Menu · Cart · My Orders · Track · Login/Account
  - manager (admin): Dashboard · Orders · Menu · Staff · Offers · Analytics · Marketing
  - cook (kitchen): KDS only
  - delivery agent: Delivery queue only


---

## 3. Screens

### 3.1 Customer — Menu (`/`) `pages/customer/MenuPage.jsx`

```
┌─ Navbar ─────────────────────────────────┐
│ 🍕 Dorito   Menu  Cart  My Orders  Track │
├──────────────────────────────────────────┤
│                                          │
│  ┌──── HERO CAROUSEL ─────┐              │
│  │  Slide 1: "Fresh pizza"│  autoplay 4s │
│  │  [Order Now]           │              │
│  └────────────────────────┘              │
│                                          │
│  🔍 [Search items…]                      │
│                                          │
│  Tabs: [All] [Pizza] [Burger] [Chicken]  │
│        [Cake] [Coffee] [Pasta]           │
│                                          │
│  ┌──Card──┐  ┌──Card──┐  ┌──Card──┐     │
│  │ 🍕 img │  │ 🍔 img │  │ 🍗 img │     │
│  │ Title  │  │ Title  │  │ Title  │     │
│  │ ₹120   │  │ ₹50    │  │ ₹120   │     │
│  │ [+ Add]│  │ [+ Add]│  │ [+ Add]│     │
│  └────────┘  └────────┘  └────────┘     │
│  … more cards in grid …                  │
└──────────────────────────────────────────┘
```

- Category filter pills are horizontal-scroll on mobile.
- Cards show: image (SVG), name, price, "Add" button (+ qty stepper if in cart).
- Out-of-stock items show a "Sold out" ribbon and disabled button.

### 3.2 Customer — Cart (`/cart`) `pages/customer/CartPage.jsx`

- Two-column on `md+`, single column on mobile.
- Left: list of items with qty stepper and remove button.
- Right (sticky on desktop): subtotal, delivery fee (₹0 currently), total,
  "Proceed to Checkout" CTA.
- Empty state: illustration + "Cart is empty, browse menu →".

### 3.3 Customer — Checkout (`/checkout`) `pages/customer/CheckoutPage.jsx`

Sections, in order:
1. **Contact** — name (read from auth) + phone (read-only, normalized).
2. **Address** — textarea + pincode (free text today; Google Maps deferred to v3.0).
3. **Payment method** — radio: `COD` (default) | `UPI` (shows shop UPI ID + QR).
4. **Apply coupon** — input + "Apply" button; server validates and shows discount.
5. **Order summary** — itemized list + discount line + total.
6. **Place order** — primary CTA `bg-brand-red text-white rounded-xl w-full py-3`.

If unauthenticated: after step 6, the OTP sheet slides up (handled in
`AuthContext.sendOtp` + `verifyOtp`).

### 3.4 Customer — Track Order (`/track/:id`) `pages/customer/TrackOrderPage.jsx`

```
[Order #DP-20260828-0007]   Placed at 19:42

🧾 Placed  ─►  👨‍🍳 Preparing  ─►  🍕 Ready  ─►  🛵 Out  ─►  ✅ Delivered
  ✓              ●                  ○            ○            ○
                                  current
   Order details (items, total, agent name when assigned)
   [Resend delivery OTP]  [Call shop]
```

- 5-second polling via `usePolling`.
- Color-coded badges (from `constants.js` → `STATUS_COLORS`).
- `cancelled` status shows a red stop icon instead of the flow.

### 3.5 Customer — My Orders (`/my-orders`) `pages/customer/MyOrdersPage.jsx`

- List view, most recent first.
- Each row: order #, date, total, status badge, "Track" link.

### 3.6 Manager — Dashboard (`/admin`) `pages/admin/DashboardPage.jsx`

4 KPI cards in a row (responsive → 2-col on mobile):

| Today's Sales | Active Orders | Delivered | Cancelled |
|---|---|---|---|
| ₹1,245 | 7 | 23 | 1 |

Below: status breakdown bar + top 10 items list + 7-day sparkline (analytics).

### 3.7 Manager — Manage Orders (`/admin/orders`) `pages/admin/ManageOrdersPage.jsx`

- Filters: status (multi-select) + date range + search by phone/name.
- Table: order # · time · customer · items count · total · status · actions.
- Actions: **Assign agent** (dropdown of delivery staff), **Cancel** (pre-delivery
  only), **View details** (side drawer).


### 3.8 Manager — Manage Menu (`/admin/menu`) `pages/admin/ManageMenuPage.jsx`

- Two tabs: **Categories** · **Items**.
- Categories: list with drag-to-reorder (sort order), edit name/image, add new.
- Items: grid with availability toggle, edit modal (name, price, category, image),
  delete with confirm.

### 3.9 Manager — Offers (`/admin/offers`) `pages/admin/ManageOffersPage.jsx`

- Table of offers: code, type (% | flat), value, min order, valid till, usage
  (used / limit), active toggle.
- "New offer" modal captures all fields + valid date range.

### 3.10 Manager — Staff (`/admin/staff`) `pages/admin/ManageStaffPage.jsx`

- Table of staff with role, phone, active toggle, "Add staff" button.

### 3.11 Manager — Analytics (`/admin/analytics`) `pages/admin/AnalyticsPage.jsx`

- 7-day order/revenue line chart.
- Category split pie chart.
- Payment split (COD vs UPI) bar.
- New vs returning customers.

### 3.12 Manager — Marketing (`/admin/marketing`) `pages/admin/MarketingPage.jsx`

- Tabs: **Broadcast** · **Reorder** · **Winback** · **Outbox audit**.
- Broadcast tab: text-area template + "Send to opted-in customers" (200 batch cap).
- Outbox audit: last 50 messages with status + delivery state.

### 3.13 Kitchen Display (`/kitchen`) `pages/kitchen/KitchenDisplayPage.jsx`

```
┌────────────┐ ┌────────────┐ ┌────────────┐
│ #0007      │ │ #0008      │ │ #0009      │
│ 19:42      │ │ 19:44      │ │ 19:46      │
│ 1× Veg Piz │ │ 2× Burger  │ │ 1× Cake    │
│ 1× Coke    │ │ 1× Fries   │ │            │
│ [Preparing]│ │ [Pending]  │ │ [Pending]  │
│ [Advance →]│ │ [Advance →]│ │ [Advance →]│
└────────────┘ └────────────┘ └────────────┘
```

- 4-second polling, columns auto-advance visually.
- 3 columns by status (Pending · Preparing · Ready) on wide screens, 1 column
  stacked on mobile.
- Color-coded top border matches status color.

### 3.14 Delivery (`/delivery`) `pages/delivery/DeliveryPage.jsx`

- List of my assigned orders, 5-second polling.
- Each card: order #, customer name, address, items, "Mark out for delivery" button
  (status: ready), "Verify OTP & deliver" (status: out_for_delivery) — opens 4-digit
  OTP input modal.

---

## 4. Component Library

All reusable components live in `frontend/src/components/`.

### 4.1 `<Navbar />`
- Props: none (reads from `AuthContext`).
- Renders: logo, role-aware links, login/logout button.
- Sticky top, `bg-brand-dark text-white`, `h-16`.

### 4.2 `<HeroCarousel />`
- Auto-advance every 4 s, pause on hover.
- 3 slides (offer banners) — image + headline + CTA.
- Dots indicator at bottom.

### 4.3 `<MenuItemCard />`
- Props: `item`, `onAdd`.
- Renders: SVG image, name, `₹price`, "Add" button (or qty stepper if already in
  cart via `CartContext`).
- Hover: `scale-105 shadow-md` transition.

### 4.4 `<OrderStatusTracker />`
- Props: `currentStatus` (one of the 6 enum values).
- Renders: 5-step progress bar (cancelled shows red stop).
- Uses `STATUS_FLOW` from `constants.js`.

### 4.5 `<StatusBadge />`
- Props: `status`.
- Renders: a pill with the matching `STATUS_COLORS` background and `STATUS_LABELS`
  text.

### 4.6 `<RequireRole role="manager">` (planned, see `PHASE.md` B4)
- Wraps a route, redirects to `/login` if unauthenticated or wrong role.

### 4.7 Shared atoms (planned)
- `<Spinner />` — `<div className="animate-spin h-6 w-6 border-2 border-brand-red
  border-t-transparent rounded-full" />`.
- `<ErrorBanner message="..." />` — red top banner with dismiss.
- `<EmptyState icon="🍕" title="No orders yet" />`.


---

## 5. Motion & Feedback

| Action | Feedback |
|--------|----------|
| Click primary CTA | scale 0.97 for 100 ms (Tailwind `active:scale-95`) |
| Add to cart | cart icon in navbar briefly bumps (`animate-bounce` once) |
| Status advance | progress bar smooth-fills (`transition-all duration-500`) |
| Toast (success) | top-center, slides in 200 ms, auto-dismiss 3 s |
| Toast (error) | red, sticks 5 s, manual dismiss |
| Modal | fade + scale-up backdrop |

No heavy animation libraries. Tailwind `transition-*` + `animate-*` only.

---

## 6. Accessibility

- Semantic HTML: `<header>`, `<main>`, `<nav>`, `<footer>`, `<button>` (not `<div>`).
- All icon-only buttons have `aria-label` (e.g. cart icon → "Cart, 3 items").
- All form inputs have associated `<label>`.
- Focus rings: never `outline: none` without a custom `focus-visible:ring-2`.
- Color is never the **only** signal — status uses icon + text + color.
- Color contrast: WCAG AA (≥ 4.5:1 for body, ≥ 3:1 for large text).
- Live regions: `aria-live="polite"` on the order status tracker so screen-reader
  users hear "Status changed to Out for delivery".

---

## 7. Internationalization (Hindi / English)

- v1 ships in **Hinglish** (Devanagari avoided for technical compatibility).
- All user-facing strings live in `frontend/src/strings.js` (planned — see
  `PHASE.md` P5.6). Once added, a toggle in the navbar swaps the dictionary.
- Today: copy is already in Hinglish ("Yeh order ready hai", "OTP bhej diya").
- Currency is hard-coded to `₹` (Indian Rupee).

---

## 8. Empty / Error / Loading States

Every async surface MUST define all three.

| State | Visual |
|-------|--------|
| Loading | Centered `<Spinner />` + neutral grey skeleton where appropriate |
| Empty | Illustration + headline + helper text + (optional) CTA |
| Error | Red banner with retry button; never just "Something went wrong" |

---

## 9. PWA Install / Offline

- Manifest name: "Dorito Pizza and Bakery".
- Theme color: `#e11d2e` (brand red).
- Icons: 192 px + 512 px + maskable variants.
- Service worker: cache-first for static assets, network-first for `/api/*`.
- Offline fallback page: "Offline ho, lekin aap menu dekh sakte ho. Naya order
  karne ke liye internet chahiye."

---

## 10. Asset Inventory

| Path | Format | Source |
|------|--------|--------|
| `public/favicon.svg` | SVG | Hand-authored pizza-slice mark |
| `public/images/menu/*.svg` | SVG | 6 category illustrations |
| `public/icon-192.png` | PNG | Generated by `scripts/gen_art.py` |
| `public/icon-512.png` | PNG | Generated by `scripts/gen_art.py` |
| Hero carousel images | JPG (planned) | Photographer TBD (P5.4) |

All committed assets are SVG or generated. No large binary uploads.

---

## 11. Design Decisions Log

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-15 | Use emoji as status icons instead of icon library | Saves ~80 KB, no font-load delay |
| 2026-08-15 | Brand palette red + gold + charcoal | Matches existing menu card print, evokes warmth |
| 2026-08-18 | Polling 5 s instead of WebSockets | Reliable behind nginx + no extra service |
| 2026-08-20 | Hero carousel auto-advance 4 s | Short enough to keep fresh, long enough to read |
| 2026-08-22 | Mobile-first 1-col → 3-col grid | Primary device is phone (Desi market) |
| 2026-08-25 | No icon library | Bundle-size budget + no SVG sprites needed yet |
| 2026-08-27 | Hinglish (not pure Hindi) in copy | Maximum comprehension, no Devanagari rendering cost |

