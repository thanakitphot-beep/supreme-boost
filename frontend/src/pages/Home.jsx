import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-white/10 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="text-xl font-bold tracking-wider flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">⚡</div>
            INDICATOR <span className="text-cyan-400">WEB CHAT</span>
          </div>
          <div className="flex gap-4">
            <Link to="/login" className="text-sm font-medium hover:text-cyan-400 transition flex items-center">Login</Link>
            <Link to="/register" className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-white text-slate-900 hover:bg-slate-100 transition shadow-lg shadow-white/10">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[50vh] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none"></div>
        <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
          Next-Gen AI <br />
          <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Automation Platform</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10">
          Supercharge your website with an intelligent matrix. Handle customer support, proactive sales, and dynamic routing fully autonomously.
        </p>
        <Link to="/register" className="px-8 py-4 rounded-xl text-lg font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:scale-105 transition shadow-xl shadow-cyan-500/20">
          Start Free Trial
        </Link>
      </main>
    </div>
  )
}
