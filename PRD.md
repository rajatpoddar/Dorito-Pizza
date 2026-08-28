# 📋 Product Requirements Document (PRD) - Dorito Pizza and Bakery

## 1. Executive Summary
Dorito Pizza and Bakery is a production-ready food ordering platform with 4 role-based applications sharing one Flask REST API + PostgreSQL database and one React SPA.

## 2. Problem Statement
Traditional restaurant ordering systems are fragmented, lack real-time tracking, and don't provide integrated management capabilities. Dorito needed a unified platform for online ordering, kitchen operations, delivery management, and customer engagement via WhatsApp.

## 3. Target Users & Roles

### 3.1 Customer (Public App)
- Browse menu by category, add items to cart (1-20 qty)
- Checkout with COD/UPI, WhatsApp OTP authentication (6-digit code)
- Live order tracking: Pending → Preparing → Ready → Out for Delivery → Delivered
- Order history, discount offers, guest checkout with OTP linking

### 3.2 Manager (Admin Panel /admin)
- Dashboard (daily sales, active orders, status breakdown)
- Full menu CRUD, order management (assign agents, cancel, filter)
- Staff management (create/activate/deactivate)
- Offers/discounts CRUD, analytics, marketing broadcast, WhatsApp status, outbox audit

### 3.3 Kitchen Staff (KDS /kitchen)
- Real-time order queue with 4-second polling
- Visual board: Pending → Preparing → Ready
- One-click status advancement, order details, agent visibility

### 3.4 Delivery Agent App (/delivery)
- Assigned orders queue with 5-second polling
- Customer info, payment details, 4-digit OTP verification

## 4. Core Features & Requirements

### 4.1 Order Lifecycle
pending ──► preparing ──► ready ──► out_for_delivery ──► delivered
    │            (Cook/KDS)  (Cook)    (Manager assigns →)   (Agent + OTP verify)
    └────────► cancelled (Manager only, before delivery)

### 4.2 Authentication & Authorization
- WhatsApp OTP-based login (6-digit code via Evolution API)
- Password login for staff, JWT tokens with 30-day expiry
- Role-based access control with decorators
- Auto user creation for new customers via OTP
- Guest order linking after OTP verification
- Session persistence via localStorage

### 4.3 Menu System
- 6 categories with branded SVG images
- 34 menu items (₹25 - ₹400 range)
- Category filtering, search, item availability toggle
- Server-side price validation, order snapshotting

### 4.4 Order Processing
- Server-side price calculation (security)
- Offer/discount validation (server-computed only)
- Order number: DP-YYYYMMDD-XXXX format
- 4-digit delivery OTP, quantity validation (1-20)
- Discount computation with caps, minimum order validation

### 4.5 WhatsApp Integration (Evolution API v2.3.5)
- Outbox pattern with rate limiting (2.5s min interval + jitter)
- Message templates: OTP, order confirmation, out for delivery, delivered
- Marketing broadcast (max 200/batch), reorder/winback campaigns
- Delivery OTP resend functionality

### 4.6 Real-time Updates
- Polling every 5 seconds via setInterval + axios
- Chosen over WebSockets for reliability
- Live order tracking for customers, live queues for staff

### 4.7 Notifications System
- In-app bell notifications (read/unread status)
- Types: order updates, offers, informational
- Order events: confirmed, preparing, ready, out_for_delivery, delivered, cancelled

### 4.8 Analytics & Reporting
- Daily sales summary, active orders count with status breakdown
- Top 10 selling items by quantity and revenue
- 7-day trends: category split, payment split
- Customer metrics: new vs returning, repeat rate
- Delivery agent performance: orders delivered, revenue per agent
- KPIs: total revenue, total orders, average order value, discount given

### 4.9 Offers & Discounts
- Types: percent (%) or flat (₹)
- Configurable: value, min_order_amount, max_discount (percent only)
- Date-based: starts_at, ends_at, usage limits with tracking
- Active status toggle, server-side validation at checkout
- Public API for active offers on checkout page

### 4.10 PWA & User Experience
- Progressive Web App with service worker (offline-first)
- Web App Manifest with icons (192px, 512px)
- Add-to-Home-Screen support
- Responsive mobile-first design (Tailwind CSS v3)
- Brand colors: red, gold, black
- SVG category images, hero carousel, visual feedback

## 5. Non-Functional Requirements

### 5.1 Performance
- Page load time < 3 seconds on 3G
- API response time < 500ms for 95% of requests
- Support for 100+ concurrent users
- Efficient polling mechanism minimizing server load
- Background worker for WhatsApp sending (non-blocking)

### 5.2 Security
- JWT-based authentication with secure token storage (localStorage)
- Role-based access control enforcement on all protected routes
- Input validation and sanitization (phone normalization, input trimming)
- Password hashing using werkzeug generate_password_hash/check_password_hash
- OTP hashing at rest with SHA-256 + salt
- SQL injection prevention via SQLAlchemy ORM
- CORS properly configured for API origins
- Rate limiting on OTP sending (3 per 10-min window, 60s resend cooldown)
- OTP brute-force protection (5 attempts max)

### 5.3 Reliability
- Graceful degradation when WhatsApp API unavailable (queued messages)
- Local storage persistence for cart and auth state
- Database connection handling with schema migration helpers
- Health check endpoint for Docker
- Worker crash recovery (rescuing stuck sending messages)
- SQLite fallback for local development
- Docker healthcheck for PostgreSQL

### 5.4 Scalability
- Horizontal scaling via Docker Compose (3 services: db, backend, frontend)
- PostgreSQL connection pooling
- Stateless API design (JWT session)
- Environment-based configuration (Dev/Docker/Test)
- Named volumes for persistent data
- Nginx reverse proxy for production traffic

### 5.5 Usability
- Mobile-first responsive design
- Intuitive role-based navigation
- Minimal steps for order completion (menu → cart → checkout → OTP → done)
- Clear visual feedback for order status with color-coded badges
- Customer-facing Hindi/English mix (Desi UX)
- Accessibility considerations (semantic HTML, ARIA where applicable)

## 6. Success Metrics
- Order completion rate > 85%
- Average order value increase > 15% via offers
- Customer retention rate > 40% month-over-month
- Kitchen ticket processing time < 5 minutes
- Delivery agent utilization > 75%
- System uptime > 99%
- Customer satisfaction score > 4.5/5
- WhatsApp delivery rate > 95%
- Offer redemption rate > 10%

## 7. Technical Stack Summary
| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11 + Flask 3 |
| ORM | Flask-SQLAlchemy + Flask-Migrate (Alembic) |
| Database | PostgreSQL 16 (SQLite for local dev) |
| Auth | Flask-JWT-Extended + role decorators |
| WhatsApp | Evolution API v2.3.5 |
| Frontend | React 18 (Vite) + React Router v6 |
| Styling | Tailwind CSS v3 |
| State | Context API + localStorage |
| Deployment | Docker + docker-compose + nginx |
| PWA | Service worker + manifest.json |

## 8. Assumptions and Dependencies
- WhatsApp Evolution API availability and reliability
- Customers have WhatsApp access for OTP authentication
- Basic technical literacy among restaurant staff
- Stable internet connection at restaurant location
- Availability of delivery personnel with smartphones
- Compliance with local food delivery regulations
- Payment collected on delivery (COD) or verified via UPI confirmation
- Order history, auto-refresh, mark delivered with OTP confirmation