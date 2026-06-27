import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LogOut } from 'lucide-react'

export default function AdminDashboard() {
  const [stats, setStats] = useState({ tenants: 0, pending: 0, online: true })
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    const { count: tenantsCount } = await supabase.from('tenants').select('*', { count: 'exact', head: true })
    const { count: pendingCount } = await supabase.from('billing_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    
    setStats({
      tenants: tenantsCount || 0,
      pending: pendingCount || 0,
      online: true
    })

    const { data: tenantsData } = await supabase.from('tenants').select('*').order('created_at', { ascending: false }).limit(10)
    if (tenantsData) setTenants(tenantsData)
    
    setLoading(false)
  }

  const handleLogout = async () => {
    localStorage.removeItem('admin_token')
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-300 flex">
      {/* Sidebar */}
      <div className="w-64 border-r border-white/5 bg-slate-900/80 p-4 flex flex-col fixed h-full z-10">
        <div className="text-xl font-bold text-white mb-8 flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-sm">⚡</div>
          ADMIN
        </div>
        
        <nav className="flex-1 space-y-2">
          <button className="w-full text-left px-4 py-3 rounded-lg bg-cyan-500/10 text-cyan-400 font-medium">Dashboard</button>
          <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-white/5 transition">Tenants ({stats.tenants})</button>
          <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-white/5 transition">Billing ({stats.pending})</button>
        </nav>

        <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-3 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition mt-auto">
          <LogOut size={18} /> Sign Out
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 ml-64">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-white">System Overview</h1>
          <p className="text-slate-500">Monitor all tenants and system health</p>
        </header>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800/50 border border-white/5 p-6 rounded-2xl">
            <h3 className="text-slate-400 font-medium mb-2">Total Tenants</h3>
            <p className="text-4xl font-bold text-white">{stats.tenants}</p>
          </div>
          <div className="bg-slate-800/50 border border-white/5 p-6 rounded-2xl">
            <h3 className="text-slate-400 font-medium mb-2">Pending Billing</h3>
            <p className="text-4xl font-bold text-cyan-400">{stats.pending}</p>
          </div>
          <div className="bg-slate-800/50 border border-white/5 p-6 rounded-2xl">
            <h3 className="text-slate-400 font-medium mb-2">System Status</h3>
            <p className="text-xl font-bold text-green-400 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse"></span> Online
            </p>
          </div>
        </div>
        
        {/* Data Table */}
        <div className="bg-slate-800/50 border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5">
            <h2 className="text-xl font-bold text-white">Recent Tenants</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Company</th>
                  <th className="px-6 py-4 font-medium">Package</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tenants.map(t => (
                  <tr key={t.id} className="hover:bg-white/5 transition">
                    <td className="px-6 py-4 text-white font-medium">{t.company_name}</td>
                    <td className="px-6 py-4 capitalize">{t.package_type}</td>
                    <td className="px-6 py-4">
                      <span className={\`px-2 py-1 rounded text-xs \${t.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}\`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{new Date(t.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-slate-500">No tenants found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
