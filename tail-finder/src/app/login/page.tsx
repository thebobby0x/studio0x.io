'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Plane, ArrowRight, ScanLine } from 'lucide-react';

export default function LoginPage() {
    const [username, setUsername] = useState('AGENT-007');
    const [password, setPassword] = useState('secret');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const result = await signIn('credentials', {
            username,
            password,
            redirect: false,
        });

        if (result?.ok) {
            router.push('/');
        } else {
            alert('Access Denied: Invalid Credentials');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 overflow-hidden relative">

            {/* Background Effects */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 animate-pulse-slow"></div>
                <div className="grid grid-cols-12 h-full w-full opacity-10 pointer-events-none">
                    {Array.from({ length: 100 }).map((_, i) => (
                        <div key={i} className="border-r border-b border-blue-500/20"></div>
                    ))}
                </div>
            </div>

            <div className="max-w-md w-full relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-blue-900/50 mb-6 group relative overflow-hidden">
                        <div className="absolute inset-0 bg-blue-500/10 blur-xl group-hover:bg-blue-500/20 transition-all"></div>
                        <Plane className="h-10 w-10 text-blue-500 relative z-10" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tighter mb-2">
                        AERO<span className="text-blue-500">TRACK</span>
                    </h1>
                    <p className="text-slate-400 text-sm font-mono tracking-widest uppercase">Restricted Access Portal</p>
                </div>

                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-2">
                                <ScanLine className="h-3 w-3" /> Agent ID
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-mono"
                                placeholder="AGENT-007"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-2">
                                <Lock className="h-3 w-3" /> Access Code
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-mono"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-lg shadow-lg shadow-blue-900/30 transition-all flex items-center justify-center gap-2 group"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    AUTHENTICATING...
                                </>
                            ) : (
                                <>
                                    SECURE LOGIN <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="my-6 flex items-center gap-4">
                        <div className="h-px bg-slate-800 flex-1"></div>
                        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Or Access With</span>
                        <div className="h-px bg-slate-800 flex-1"></div>
                    </div>

                    <div className="space-y-3">
                        <button
                            onClick={() => signIn('google')}
                            className="w-full bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
                        >
                            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                            Google Workspace
                        </button>
                        <button
                            onClick={() => signIn('apple')}
                            className="w-full bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
                        >
                            <svg viewBox="0 0 384 512" className="h-4 w-4 fill-white" xmlns="http://www.w3.org/2000/svg"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 52.3-11.4 69.5-34.3z" /></svg>
                            Apple ID
                        </button>
                        <button
                            onClick={() => alert('Passkey requires database adapter. This is a UI demo.')}
                            className="w-full bg-blue-900/10 border border-blue-500/30 hover:bg-blue-900/20 text-blue-400 font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
                        >
                            <Shield className="h-4 w-4" />
                            Sign in with Passkey
                        </button>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-800/50 text-center">
                        <p className="text-[10px] text-slate-600 font-mono">
                            UNAUTHORIZED ACCESS TO THIS SYSTEM IS A CRIMINAL OFFENSE. ALL ACTIVITIES ARE LOGGED (IP: 192.168.X.X).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
