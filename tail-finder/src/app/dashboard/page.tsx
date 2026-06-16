'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Lock, Settings, Radar, Bell, Trash2, Crosshair } from 'lucide-react';

export default function DashboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [watchlist, setWatchlist] = useState<any[]>([]);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
        if (session?.user) {
            fetch('/api/watchlist')
                .then(res => res.json())
                .then(data => setWatchlist(data));
        }
    }, [status, router, session]);

    const removeFromWatchlist = async (icao: string) => {
        const res = await fetch('/api/watchlist', {
            method: 'DELETE',
            body: JSON.stringify({ icao })
        });
        if (res.ok) {
            setWatchlist(prev => prev.filter(item => item.icao !== icao));
        }
    };

    if (status === 'loading') {
        return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-blue-500 font-mono">LOADING CLEARANCE...</div>;
    }

    if (!session) return null;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
            {/* Header */}
            <header className="bg-slate-900/50 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <Radar className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight">COMMAND CENTER</h1>
                            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-400">
                                <span>Agent: {session.user?.name}</span>
                                {session.user?.role === 'admin' && (
                                    <span className="text-red-500 bg-red-900/20 px-1.5 py-0.5 rounded border border-red-900/50">Level 5 Clearance</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => router.push('/')} className="text-sm font-bold text-slate-400 hover:text-white transition-colors">
                        RETURN TO MAP
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Active Targets', value: '0', icon: Crosshair, color: 'text-blue-400' },
                        { label: 'Surveillance Zones', value: '0', icon: Radar, color: 'text-emerald-400' },
                        { label: 'Alerts (24h)', value: '0', icon: Bell, color: 'text-amber-400' },
                        { label: 'System Status', value: 'ONLINE', icon: Lock, color: 'text-green-500' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:bg-slate-800/50 transition-colors group">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-mono uppercase text-slate-500 tracking-wider">{stat.label}</span>
                                <stat.icon className={`h-4 w-4 ${stat.color} opacity-50 group-hover:opacity-100 transition-opacity`} />
                            </div>
                            <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Intelligence Feed */}
                    <div className="lg:col-span-2 space-y-6">
                        <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                                <h2 className="font-bold text-white flex items-center gap-2">
                                    <Radar className="h-4 w-4 text-blue-500" /> Intelligence Feed
                                </h2>
                                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded-full animate-pulse font-mono">LIVE</span>
                            </div>
                            <div className="p-0 h-96 overflow-y-auto font-mono text-sm">
                                {/* Placeholder Empty State */}
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                                    <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center">
                                        <Bell className="h-8 w-8 opacity-20" />
                                    </div>
                                    <p>No recent intelligence reports.</p>
                                </div>
                            </div>
                        </section>

                        <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-slate-800">
                                <h2 className="font-bold text-white flex items-center gap-2">
                                    <Crosshair className="h-4 w-4 text-emerald-500" /> Watchlist
                                </h2>
                            </div>
                            <div className="p-4">
                                {watchlist.length === 0 ? (
                                    <div className="text-center py-12 text-slate-600 border-2 border-dashed border-slate-800 rounded-lg">
                                        <p>No active targets. Mark aircraft on the map to track.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {watchlist.map((item) => (
                                            <div key={item.id} className="bg-slate-800/50 p-4 rounded-lg flex items-center justify-between group hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50"></div>
                                                    <div>
                                                        <div className="font-black text-xl text-white tracking-wider">{item.icao.toUpperCase()}</div>
                                                        <div className="text-[10px] text-slate-500 font-mono">TRACKING ACTIVE</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => removeFromWatchlist(item.icao)}
                                                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    {/* Settings Panel */}
                    <div className="space-y-6">
                        <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-slate-800">
                                <h2 className="font-bold text-white flex items-center gap-2">
                                    <Settings className="h-4 w-4 text-slate-400" /> Alert Configuration
                                </h2>
                            </div>
                            <div className="p-6 space-y-6">
                                <div className="space-y-4">
                                    <label className="flex items-center justify-between group cursor-pointer">
                                        <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Push Notifications</span>
                                        <div className="w-10 h-6 bg-blue-600 rounded-full relative">
                                            <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
                                        </div>
                                    </label>
                                    <label className="flex items-center justify-between group cursor-pointer">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Email Digests</span>
                                            <span className="text-[10px] text-slate-500">Daily summary of zone activity</span>
                                        </div>
                                        <div className="w-10 h-6 bg-slate-700 rounded-full relative">
                                            <div className="absolute left-1 top-1 w-4 h-4 bg-slate-400 rounded-full shadow-sm"></div>
                                        </div>
                                    </label>
                                    <label className="flex items-center justify-between group cursor-pointer">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">SMS Alerts</span>
                                            <span className="text-[10px] text-slate-500">Critical zone breaches only</span>
                                        </div>
                                        <div className="w-10 h-6 bg-slate-700 rounded-full relative">
                                            <div className="absolute left-1 top-1 w-4 h-4 bg-slate-400 rounded-full shadow-sm"></div>
                                        </div>
                                    </label>
                                </div>

                                <div className="pt-4 border-t border-slate-800">
                                    <button className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded uppercase tracking-wider transition-colors">
                                        Save Configuration
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-4">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Active Zones</h3>
                            <div className="space-y-2">
                                {/* Placeholder Zone */}
                                <div className="bg-slate-950/50 p-3 rounded border border-slate-800/50 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                        <span className="text-sm font-mono text-slate-300">HOME BASE</span>
                                    </div>
                                    <span className="text-[10px] text-slate-600 font-mono">10km</span>
                                </div>
                            </div>
                            <button className="w-full mt-4 py-2 border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 text-xs font-bold rounded uppercase tracking-wider transition-all">
                                + Add New Zone
                            </button>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}
