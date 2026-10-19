import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { wsService } from '../services/websocket'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [token, setToken] = useState(() => localStorage.getItem('token') || null)
  // loading is false from the start — session is restored synchronously above
  const [loading, setLoading] = useState(false)

  // Silently verify token in background and refresh user data
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) return

    api.getMe(storedToken)
      .then((res) => {
        if (res.user) {
          setToken(storedToken)
          setUser(res.user)
          localStorage.setItem('user', JSON.stringify(res.user))
        } else {
          // Token rejected — clear session
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          setToken(null)
          setUser(null)
        }
      })
      .catch(() => {
        // Network error — keep existing session, don't force logout
      })
  }, [])

  const login = useCallback((userData, authToken) => {
    setUser(userData)
    setToken(authToken)
    localStorage.setItem('token', authToken)
    localStorage.setItem('user', JSON.stringify(userData))
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    // Disconnect WebSocket to clear any remaining connections
    wsService.disconnect()
    // Redirect to home page after logout
    window.location.href = '/'
  }, [])

  const updateUser = useCallback((userData) => {
    setUser(userData)
    localStorage.setItem('user', JSON.stringify(userData))
  }, [])

  const isAdmin = user?.role === 'admin'
  const isAuthenticated = !!token && !!user

  return (
    <AuthContext.Provider value={{ user, token, loading, isAuthenticated, isAdmin, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
