# 🏗️ Architecture Document - Dorito Pizza and Bakery

## 1. Overview
Dorito follows a modern, scalable architecture with clear separation of concerns between frontend, backend, and infrastructure layers. The system is designed for reliability, maintainability, and ease of deployment.
## 2. System Architecture
Frontend SPA (React/Vite) connects via API Gateway (Flask REST API) to external services (WhatsApp). Infrastructure uses Docker Compose with PostgreSQL database, Python backend, and nginx frontend.

## 3. Technology Stack

### 3.1 Frontend (Client-Side)
- **Framework**: React 18 with Vite bundler
- **Routing**: React Router v6 for client-side routing
- **State Management**: React Context API (AuthContext, CartContext)
- **Styling**: Tailwind CSS v3 for utility-first CSS
- **HTTP Client**: Axios with JWT interceptor
- **PWA Features**: Service Worker, Web App Manifest, offline caching
- **Build Tool**: Vite with production optimization

### 3.2 Backend (Server-Side)
- **Framework**: Flask 3.0 (Python microframework)
- **API Design**: RESTful endpoints with JSON payloads
- **ORM**: Flask-SQLAlchemy (SQLAlchemy 2.0) for database abstraction
- **Migrations**: Flask-Migrate (Alembic) for schema versioning
- **Authentication**: Flask-JWT-Extended for stateless JWT tokens
- **Authorization**: Custom role-based decorators
- **CORS**: Flask-CORS for cross-origin resource sharing
### 3.3 Database Layer
- **Primary**: PostgreSQL 16 (production)
- **Development**: SQLite (local development, testing)
- **Connection Pooling**: SQLAlchemy built-in pooling
- **Migration Tool**: Alembic via Flask-Migrate
- **Schema Helpers**: Custom utilities for backward compatibility
- **Indexing**: Strategic indexes on frequently queried columns

### 3.4 Infrastructure & DevOps
- **Containerization**: Docker Compose for multi-service orchestration

## 4. Component Architecture

### 4.1 Frontend Components
- **Layout**: Navbar (role-based), responsive design
- **Customer Pages**: Menu, Cart, Checkout, Tracking, My Orders, Login, Register
- **Manager Pages**: Dashboard, Menu Management, Order Management, Staff, Offers, Analytics, Marketing
- **Kitchen**: Kitchen Display System (KDS)
- **Delivery**: Delivery Agent Interface
- **Reusable Components**: MenuItemCard, OrderStatusTracker, StatusBadge, HeroCarousel

### 4.2 Backend Modules
- **Application Factory**: create_app() pattern for Flask
- **Extensions**: Database, JWT, Migrate, CORS singletons

## 5. Data Flow

### 5.1 Customer Order Flow
1. User browses menu → API fetches categories/items
2. User adds items to cart → stored in localStorage via CartContext
3. User proceeds to checkout → form validation
4. For unauthenticated users: WhatsApp OTP send/verify flow
5. Order creation with server-side validation and calculation
6. Order tracking via polling every 5 seconds

### 5.2 Kitchen Workflow
1. Kitchen staff views /kitchen → polls every 4 seconds
2. Backend returns orders with status: pending, preparing, ready

## 6. Security Architecture

### 6.1 Authentication
- **JWT Tokens**: HS256 signed, 30-day expiration, stored in localStorage
- **OTP System**: 6-digit for login, 4-digit for delivery verification
- **Hashing**: SHA-256 with salt for OTPs, werkzeug for passwords

### 6.2 Authorization
- **Role-Based Access Control**: Custom @roles_required decorator
- **Route Protection**: All API endpoints require appropriate role
- **Admin Privileges**: Manager role has full system access

### 6.3 Data Protection
- **Input Validation**: Server-side validation for all inputs
- **SQL Injection Prevention**: SQLAlchemy ORM with parameterized queries
- **Price Security**: All monetary calculations performed server-side

3. Staff clicks to advance status: pending → preparing → ready

### 5.3 Delivery Workflow
1. Delivery agent views /delivery → polls every 5 seconds
2. Agent marks ready orders as out_for_delivery
3. Agent verifies 4-digit OTP from customer and marks delivered

### 5.4 WhatsApp Messaging Flow
1. Trigger event queues message to whatsapp_outbox table
2. Background worker processes outbox with rate limiting (2.5s interval)
3. Marketing scheduler runs every 30min (9am-9pm IST)
- **Configuration**: Environment-based configs (Dev/Docker/Test)
- **Models**: SQLAlchemy models with relationships and methods
- **Routes**: Blueprint-organized REST API endpoints
- **Services**: Business logic layer (WhatsApp, notifications)
- **Background Workers**: WhatsApp outbox processor, Marketing scheduler
- **Services**: db (PostgreSQL), backend (Python/Gunicorn), frontend (Node/nginx)
- **Reverse Proxy**: Nginx for static file serving and API proxying
- **Environment Management**: .env files with python-dotenv
- **Health Checks**: Docker healthcheck for PostgreSQL

## 7. Reliability & Fault Tolerance

### 7.1 Error Handling
- **Graceful Degradation**: System functions with reduced capability when services fail
- **WhatsApp Fallback**: Messages queued even if API unavailable
- **Database Resilience**: Connection pooling, automatic retry on transient failures

### 7.2 Data Consistency
- **ACID Transactions**: Database operations wrapped in transactions
- **Order Snapshotting**: Item name/price stored at purchase time
- **Eventual Consistency**: Background workers handle async operations

### 7.3 Monitoring
- **Health Endpoints**: /api/health for service availability
- **Logging**: Structured logging for debugging and audit trails

## 8. Scalability Patterns

### 8.1 Horizontal Scaling
- **Stateless Backend**: All session state in JWT or database
- **Database Read Replicas**: PostgreSQL supports read scaling
- **Load Balancing**: Docker Compose can scale services horizontally

### 8.2 Performance Optimization
- **Database Indexing**: Strategic indexes on query patterns
- **Asset Optimization**: Vite production build with code splitting
- **Image Optimization**: SVG assets for scalability and small size

## 9. Deployment Architecture

### 9.1 Development Environment
- **Local Development**: Docker compose for database only
- **Environment Variables**: .env file for configuration
- **Hot Reload**: Flask debug mode, Vite dev server with proxy

### 9.2 Production Environment
- **Container Orchestration**: Docker Compose with restart policies
- **Reverse Proxy**: Nginx serving static files and proxying API requests
- **SSL Termination**: Handled by reverse proxy or cloud load balancer

## 10. Future Architectural Considerations

### 10.1 Microservices Evolution
- **Service Boundaries**: Potential split of WhatsApp, marketing, analytics services
- **Event-Driven Architecture**: Message queues for loose coupling

### 10.2 Technology Upgrades
- **Frontend**: Consider React Server Components, Next.js for SSR
- **Backend**: Evaluate FastAPI for performance and async capabilities
- **Infrastructure**: Kubernetes for orchestration at scale
- **Background Processing**: Custom worker processes (WhatsApp, scheduler)