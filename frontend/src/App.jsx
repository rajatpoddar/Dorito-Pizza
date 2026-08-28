import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import { useAuth } from './context/AuthContext'

import MenuPage from './pages/customer/MenuPage'
import CartPage from './pages/customer/CartPage'
import CheckoutPage from './pages/customer/CheckoutPage'
import MyOrdersPage from './pages/customer/MyOrdersPage'
import TrackOrderPage from './pages/customer/TrackOrderPage'
import LoginPage from './pages/customer/LoginPage'
import RegisterPage from './pages/customer/RegisterPage'

import DashboardPage from './pages/admin/DashboardPage'
import ManageMenuPage from './pages/admin/ManageMenuPage'
import ManageOrdersPage from './pages/admin/ManageOrdersPage'
import ManageStaffPage from './pages/admin/ManageStaffPage'
import ManageOffersPage from './pages/admin/ManageOffersPage'
import AnalyticsPage from './pages/admin/AnalyticsPage'
import MarketingPage from './pages/admin/MarketingPage'
import SettingsPage from './pages/admin/SettingsPage'

import KitchenDisplayPage from './pages/kitchen/KitchenDisplayPage'
import DeliveryPage from './pages/delivery/DeliveryPage'

const HOME_BY_ROLE = {
  customer: '/',
  manager: '/admin',
  cook: '/kitchen',
  delivery: '/delivery',
}

function ProtectedRoute({ roles, children }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role] || '/'} replace />
  return children
}

export default function App() {
  const { user } = useAuth()
  const isStaff = user && user.role !== 'customer'
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
        {/* ---------- customer (public) ---------- */}
        <Route path="/" element={<MenuPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/track" element={<TrackOrderPage />} />
        <Route path="/track/:orderId" element={<TrackOrderPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/my-orders"
          element={
            <ProtectedRoute roles={['customer', 'manager']}>
              <MyOrdersPage />
            </ProtectedRoute>
          }
        />

        {/* ---------- manager ---------- */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['manager']}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/menu"
          element={
            <ProtectedRoute roles={['manager']}>
              <ManageMenuPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/orders"
          element={
            <ProtectedRoute roles={['manager']}>
              <ManageOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/staff"
          element={
            <ProtectedRoute roles={['manager']}>
              <ManageStaffPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/offers"
          element={
            <ProtectedRoute roles={['manager']}>
              <ManageOffersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <ProtectedRoute roles={['manager']}>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/marketing"
          element={
            <ProtectedRoute roles={['manager']}>
              <MarketingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute roles={['manager']}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        {/* ---------- kitchen ---------- */}
        <Route
          path="/kitchen"
          element={
            <ProtectedRoute roles={['cook', 'manager']}>
              <KitchenDisplayPage />
            </ProtectedRoute>
          }
        />

        {/* ---------- delivery ---------- */}
        <Route
          path="/delivery"
          element={
            <ProtectedRoute roles={['delivery', 'manager']}>
              <DeliveryPage />
            </ProtectedRoute>
          }
        />
        </Routes>
      </main>
      {/* Marketing footer only on customer/guest pages (no extra noise on staff consoles) */}
      {!isStaff && <Footer />}
    </div>
  )
}
