import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import AuthLayout from './components/AuthLayout'
import AdminLayout from './components/AdminLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import Markets from './pages/Markets'
import TradingDesk from './pages/TradingDesk'
import Futures from './pages/Futures'
import Convert from './pages/Convert'
import Wallet from './pages/Wallet'
import Portfolio from './pages/Portfolio'
import Earn from './pages/Earn'
import OrderHistory from './pages/OrderHistory'
import Referral from './pages/Referral'
import Notifications from './pages/Notifications'
import Profile from './pages/Profile'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminPayouts from './pages/admin/AdminPayouts'
import AdminTrades from './pages/admin/AdminTrades'
import AdminSettings from './pages/admin/AdminSettings'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<AuthLayout />}>
          <Route path="/dashboard" element={<Navigate to="/portfolio" replace />} />
          <Route path="/portfolio"     element={<Portfolio />} />
          <Route path="/markets"       element={<Markets />} />
          <Route path="/trade"         element={<TradingDesk />} />
          <Route path="/futures"       element={<Futures />} />
          <Route path="/convert"       element={<Convert />} />
          <Route path="/wallet"        element={<Wallet />} />
          <Route path="/earn"          element={<Earn />} />
          <Route path="/orders"        element={<OrderHistory />} />
          <Route path="/referral"      element={<Referral />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile"       element={<Profile />} />
        </Route>
        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users"     element={<AdminUsers />} />
          <Route path="/admin/payouts"   element={<AdminPayouts />} />
          <Route path="/admin/trades"    element={<AdminTrades />} />
          <Route path="/admin/settings"  element={<AdminSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
