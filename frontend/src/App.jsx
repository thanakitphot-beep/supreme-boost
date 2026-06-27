import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

// Placeholder Components (Will create these next)
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import AdminDashboard from './pages/AdminDashboard'
import CustomerPortal from './pages/CustomerPortal'

function App() {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
      else setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
      else {
        setRole(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchRole = async (userId) => {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
    setRole(data?.role || 'customer')
    setLoading(false)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>
  }

  const ProtectedRoute = ({ children, requiredRole }) => {
    const adminToken = localStorage.getItem('admin_token')
    if (requiredRole === 'admin' && adminToken) {
      return children
    }

    if (!session) return <Navigate to="/login" replace />
    if (requiredRole && role !== requiredRole) {
       return <Navigate to={role === 'admin' ? '/admin' : '/portal'} replace />
    }
    return children
  }

  const adminToken = localStorage.getItem('admin_token')

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={(!session && !adminToken) ? <Login /> : <Navigate to={adminToken || role === 'admin' ? '/admin' : '/portal'} replace />} />
        <Route path="/register" element={(!session && !adminToken) ? <Register /> : <Navigate to={adminToken || role === 'admin' ? '/admin' : '/portal'} replace />} />
        
        <Route path="/admin/*" element={
          <ProtectedRoute requiredRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/portal/*" element={
          <ProtectedRoute requiredRole="customer">
            <CustomerPortal />
          </ProtectedRoute>
        } />
        
        {/* Catch-all route for old HTML paths */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
