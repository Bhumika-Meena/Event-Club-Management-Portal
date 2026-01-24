'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: 'STUDENT' | 'CLUB' | 'ADMIN'
  phone?: string
  avatar?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (userData: RegisterData) => Promise<User>
  logout: () => void
  updateUser: (userData: Partial<User>) => void
}

interface RegisterData {
  email: string
  password: string
  firstName: string
  lastName: string
  role?: 'STUDENT' | 'CLUB' | 'ADMIN'
  otp: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Configure axios defaults
axios.defaults.baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'
axios.defaults.withCredentials = true

// Add axios interceptor to include Authorization header as fallback
axios.interceptors.request.use(
  (config) => {
    // Try to get token from localStorage as fallback
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token')
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      // Always ask the backend who we are; it reads the HTTP-only cookie or Authorization header
      const response = await axios.get('/auth/me')
      setUser(response.data.user)
    } catch (error) {
      console.error('Auth check failed:', error)
      setUser(null)
      // Clear token if auth check fails
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token')
      }
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post('/auth/login', { email, password })
      const { user: userData, token } = response.data
      
      // Store token in localStorage as fallback (cookies are primary)
      if (token && typeof window !== 'undefined') {
        localStorage.setItem('auth_token', token)
      }
      
      setUser(userData)
      return userData
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Login failed')
    }
  }

  const register = async (userData: RegisterData) => {
    try {
      const response = await axios.post('/auth/register', userData)
      const { user: newUser, token } = response.data
      
      // Store token in localStorage as fallback (cookies are primary)
      if (token && typeof window !== 'undefined') {
        localStorage.setItem('auth_token', token)
      }
      
      setUser(newUser)
      return newUser
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Registration failed')
    }
  }

  const logout = () => {
    setUser(null)
    // Clear token from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token')
    }
    axios.post('/auth/logout')
  }

  const updateUser = (userData: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...userData } : null)
  }

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateUser
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
