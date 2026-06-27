import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    // 1. Sign up user
    const { data: authData, error: authError } = await supabase.auth.signUp({ 
      email, 
      password 
    })
    
    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // 2. If successful, Supabase might require email verification, but we can try to insert profile
    if (authData.user) {
      // For a real SaaS, you might create a tenant first
      const { data: tenantData, error: tenantError } = await supabase.from('tenants').insert({
        company_name: companyName || email.split('@')[0],
        api_key: 'sk_live_' + Math.random().toString(36).substring(2, 15),
        package_type: 'basic',
        status: 'active'
      }).select().single()

      if (!tenantError && tenantData) {
        await supabase.from('profiles').insert({
          id: authData.user.id,
          role: 'customer',
          tenant_id: tenantData.id
        })
      }
      setSuccess(true)
    }
    
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
        <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
          <h2 className="text-2xl font-bold text-white mb-2">Registration Successful</h2>
          <p className="text-slate-400 mb-6">Please check your email to verify your account, or login if verification is disabled.</p>
          <Link to="/login" className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition">Go to Login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 relative overflow-hidden">
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-cyan-500/20 rounded-full blur-[100px] animate-pulse"></div>
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-500/20 rounded-full blur-[100px] animate-pulse" style={{animationDelay: '2s'}}></div>
      
      <div className="w-full max-w-md bg-slate-800/60 backdrop-blur-2xl p-8 rounded-2xl border border-white/10 shadow-2xl z-10">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white">Create Account</h2>
          <p className="text-slate-400 text-sm mt-1">Join INDICATOR WEB CHAT</p>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg text-sm mb-6 text-center">{error}</div>}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Company Name</label>
            <input 
              type="text" 
              required
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
              placeholder="My Awesome Company"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
            <input 
              type="password" 
              required
              minLength="6"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
              placeholder="••••••••"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold py-3 rounded-lg hover:scale-[1.02] transition-transform flex items-center justify-center shadow-lg shadow-cyan-500/20 disabled:opacity-50"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Register'}
          </button>
        </form>
        
        <div className="mt-6 text-center text-sm text-slate-400">
          Already have an account? <Link to="/login" className="text-cyan-400 hover:underline">Sign In</Link>
        </div>
      </div>
    </div>
  )
}
