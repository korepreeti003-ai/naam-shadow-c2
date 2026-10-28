'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import {
  getClientAuthInstance,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from '@/lib/firebase-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const auth = getClientAuthInstance();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) router.replace('/dashboard');
    });
    return unsub;
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const auth = getClientAuthInstance();
      await signInWithEmailAndPassword(auth, email, password);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Invalid credentials');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Try again later.');
      } else {
        setError('Login failed. Check Firebase configuration.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      {/* Alien glow bg */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 mx-auto mb-5 relative">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-md animate-pulse" />
            <div className="relative w-16 h-16 rounded-full border border-emerald-500/40 bg-slate-900 flex items-center justify-center">
              <span className="text-2xl font-black text-emerald-400 tracking-tighter">A</span>
            </div>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Alien Panel</h1>
          <p className="text-sm text-slate-500 mt-1.5 tracking-widest uppercase text-xs">Device Management</p>
        </div>

        {/* Form */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase mb-2">Email</label>
              <input
                type="email" autoComplete="email" placeholder="admin@domain.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/60 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                  placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="w-full px-3 py-2.5 pr-10 rounded-lg border border-slate-700 bg-slate-800 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/60 transition"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2">
              {loading ? (
                <><div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /> Connecting…</>
              ) : 'Connect'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">Alien Panel · Authorized access only</p>
      </div>
    </div>
  );
}
