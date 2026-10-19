import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import AuthLayout from './components/AuthLayout'
import AdminLayout from './components/AdminLayout'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import Checkout from './pages/Checkout'
import Rules from './pages/Rules'
import Payouts from './pages/Payouts'
import TradingDesk from './pages/TradingDesk'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminChallenges from './pages/admin/AdminChallenges'
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
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/trade" element={<TradingDesk />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/payouts" element={<Payouts />} />
        </Route>
        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/challenges" element={<AdminChallenges />} />
          <Route path="/admin/payouts" element={<AdminPayouts />} />
          <Route path="/admin/trades" element={<AdminTrades />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
