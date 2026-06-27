import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LogOut, Copy, Check } from 'lucide-react'

export default function CustomerPortal() {
  const [loading, setLoading] = useState(true)
  const [tenant, setTenant] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchTenantData()
  }, [])

  const fetchTenantData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (profile?.tenant_id) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', profile.tenant_id)
          .single()
        setTenant(tenantData)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => supabase.auth.signOut()

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-300">
      {/* Navbar */}
      <nav className="border-b border-white/5 bg-slate-900/50 backdrop-blur-md px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="text-xl font-bold text-white flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-sm">⚡</div>
          Customer Portal
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/5 transition text-sm font-medium">
          <LogOut size={16} /> Sign Out
        </button>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-6 md:p-12">
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-white">Welcome, {tenant?.company_name || 'Customer'}</h1>
          <p className="text-slate-500 mt-2">Manage your API keys, view usage, and handle billing.</p>
        </header>

        {tenant ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* API Key Section */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-slate-800/40 border border-white/5 p-6 rounded-2xl">
                <h2 className="text-lg font-bold text-white mb-4">API Configuration</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Your API Key</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={tenant.api_key} 
                        className="flex-1 bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-slate-400 font-mono text-sm" 
                      />
                      <button 
                        onClick={() => copyToClipboard(tenant.api_key)}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition text-sm flex items-center gap-2"
                      >
                        {copied ? <Check size={16} className="text-green-400"/> : <Copy size={16}/>}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Widget Setup */}
              <div className="bg-slate-800/40 border border-white/5 p-6 rounded-2xl">
                <h2 className="text-lg font-bold text-white mb-4">Widget Setup</h2>
                <p className="text-sm text-slate-400 mb-4">Copy and paste this code into the <code>&lt;head&gt;</code> of your website.</p>
                <div className="bg-black/50 p-4 rounded-xl border border-white/5 overflow-x-auto relative group">
                  <pre className="text-sm text-emerald-400 font-mono">
                    {`<script src="https://supreme-boost-prod.vercel.app/supreme-boost/boost.js"\n  data-api-key="${tenant.api_key}"\n  data-title="${tenant.company_name} AI"\n  data-primary="#06b6d4"\n  defer></script>`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Billing Section */}
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-blue-900/40 to-cyan-900/40 border border-cyan-500/20 p-6 rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><span className="text-6xl">💎</span></div>
                <h2 className="text-lg font-bold text-white mb-2 relative z-10">Current Plan</h2>
                <p className="text-3xl font-bold text-cyan-400 mb-4 relative z-10 capitalize">{tenant.package_type}</p>
                <div className="space-y-2 text-sm text-slate-300 relative z-10">
                  <div className="flex justify-between">
                    <span>Status</span>
                    <span className={tenant.status === 'active' ? "text-green-400" : "text-yellow-400 capitalize"}>{tenant.status}</span>
                  </div>
                  {tenant.expires_at && (
                    <div className="flex justify-between">
                      <span>Renews</span>
                      <span>{new Date(tenant.expires_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
                <button className="w-full mt-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition text-sm font-medium relative z-10">Upgrade Plan</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/40 border border-white/5 p-10 rounded-2xl text-center">
            <h2 className="text-xl font-bold text-white mb-2">No Tenant Found</h2>
            <p className="text-slate-500">Your account is not linked to any active service tenant yet. Please contact support.</p>
          </div>
        )}
      </main>
    </div>
  )
}
