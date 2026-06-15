'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';
import { fetchFlights } from '@/lib/api/opensky';
import { generateSimulationData, DeepHistory } from '@/lib/simulation';
import { Flight, MapBounds } from '@/types';
import { Search, Lock, Unlock, User, Wrench, Calendar, Plane as PlaneIcon, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

// Custom Plane Icon Helper
const createPlaneIcon = (track: number, isSelected: boolean) => {
    const svg = `
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${track - 45}deg); filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.5)); transition: all 0.3s ease;">
    <path d="M12 2L2 22L12 18L22 22L12 2Z" fill="${isSelected ? '#3b82f6' : '#94a3b8'}" stroke="${isSelected ? '#60a5fa' : '#0f172a'}" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>
  `;

    return L.divIcon({
        className: 'bg-transparent',
        html: `<div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">${svg}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
};

function MapController({ onBoundsChange }: { onBoundsChange: (bounds: MapBounds) => void }) {
    const map = useMapEvents({
        moveend: () => {
            const bounds = map.getBounds();
            onBoundsChange({
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest(),
            });
        },
        load: () => {
            const bounds = map.getBounds();
            onBoundsChange({
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest(),
            });
        }
    });

    useEffect(() => {
        map.fireEvent('load');
    }, [map]);

    return null;
}

export default function MapComponent() {
    const [flights, setFlights] = useState<Flight[]>([]);
    const [filteredFlights, setFilteredFlights] = useState<Flight[]>([]);
    const [selectedIcao, setSelectedIcao] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Premium / Simulation State
    const [simData, setSimData] = useState<DeepHistory | null>(null);
    const [isUnlocking, setIsUnlocking] = useState(false);

    // UI Layout State
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        manifest: true,
        history: false,
        maintenance: false
    });
    const [showFullManifest, setShowFullManifest] = useState(false);

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const handleBoundsChange = useCallback(async (bounds: MapBounds) => {
        setLoading(true);
        try {
            const data = await fetchFlights(bounds);
            setFlights(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Filter flights based on search
    useEffect(() => {
        if (!searchQuery) {
            setFilteredFlights(flights);
        } else {
            const q = searchQuery.toLowerCase();
            setFilteredFlights(flights.filter(f =>
                f.icao24.toLowerCase().includes(q) ||
                (f.callsign && f.callsign.toLowerCase().includes(q))
            ));
        }
    }, [flights, searchQuery]);

    // Updated Selection effect to reset UI state
    useEffect(() => {
        if (selectedIcao) {
            setSimData(null);
            setIsUnlocking(false);
            setExpandedSections({ manifest: true, history: false, maintenance: false });
            setShowFullManifest(false);
        }
    }, [selectedIcao]);

    const { data: session } = useSession();
    const router = useRouter();

    const handleUnlock = async () => {
        if (!session) {
            router.push('/login');
            return;
        }

        setIsUnlocking(true);
        try {
            const res = await fetch(`/api/aircraft/${selectedIcao}`);
            if (res.ok) {
                const data = await res.json();
                setSimData(data);
            }
        } catch (error) {
            console.error("Failed to unlock data", error);
        } finally {
            setIsUnlocking(false);
        }
    };

    const selectedFlight = flights.find(f => f.icao24 === selectedIcao);

    return (
        <div className="w-full h-screen relative z-0 flex overflow-hidden">
            {/* ... (Map and Overlays remain unchanged) ... */}
            <MapContainer
                center={[40.7128, -74.0060]}
                zoom={6}
                scrollWheelZoom={true}
                className="w-full h-full block bg-slate-950 flex-1"
                style={{ background: '#020617' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                <MapController onBoundsChange={handleBoundsChange} />

                <MarkerClusterGroup
                    chunkedLoading
                    spiderfyOnMaxZoom={true}
                    showCoverageOnHover={false}
                    maxClusterRadius={60}
                >
                    {filteredFlights.map((flight) => (
                        <Marker
                            key={flight.icao24}
                            position={[flight.latitude!, flight.longitude!]}
                            icon={createPlaneIcon(flight.true_track || 0, selectedIcao === flight.icao24)}
                            eventHandlers={{
                                click: () => setSelectedIcao(flight.icao24),
                            }}
                        />
                    ))}
                </MarkerClusterGroup>
            </MapContainer>

            {/* Search Bar Overlay */}
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[400] w-full max-w-md px-4">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search Tail # or Callsign in range..."
                        className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl leading-5 bg-slate-900/90 backdrop-blur-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 sm:text-sm shadow-xl transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <span className="text-xs text-slate-600 font-mono">{filteredFlights.length} found</span>
                    </div>
                </div>
            </div>

            {/* Brand Overlay */}
            <div className="absolute top-8 left-8 z-[400] pointer-events-none select-none hidden md:block">
                <h1 className="text-4xl font-black tracking-tighter text-white drop-shadow-2xl">
                    AERO<span className="text-blue-500">TRACK</span>
                </h1>
                {session?.user?.role === 'admin' && (
                    <div className="absolute -top-4 -right-24 bg-red-500/10 border border-red-500/50 text-red-500 text-[9px] font-black px-2 py-0.5 rounded animate-pulse">
                        SUPER ADMIN
                    </div>
                )}
                <div className="text-[10px] text-blue-400 font-mono tracking-[0.2em] mt-1 border-t border-blue-900/50 pt-1">
                    GLOBAL SURVEILLANCE MATRIX
                </div>
            </div>

            {/* Dashboard Link */}
            <div className="absolute top-6 right-6 z-[400] flex items-center gap-4 hidden md:flex">
                {session && (
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="bg-slate-900/80 backdrop-blur border border-slate-700 text-slate-300 px-4 py-2 rounded font-mono text-xs hover:bg-slate-800 hover:text-white transition-colors flex items-center gap-2"
                    >
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        DASHBOARD
                    </button>
                )}
                <div className="bg-slate-900/80 backdrop-blur border border-slate-700 text-slate-300 px-4 py-2 rounded font-mono text-xs">
                    <span className="text-slate-500">UPLINK:</span> SECURE
                </div>
            </div>

            {/* Detail Panel */}
            {selectedIcao && selectedFlight && (
                <div className="absolute top-4 right-4 z-[400] w-[400px] max-h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar bg-slate-950/95 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl transition-all animate-in slide-in-from-right-10 duration-300 flex flex-col">

                    {/* Header - Fixed height, compact */}
                    <div className="p-4 border-b border-slate-800 flex justify-between items-start bg-slate-900/50 sticky top-0 z-10 backdrop-blur">
                        <div className="min-w-0">
                            <h2 className="text-xl font-black text-white truncate leading-tight tracking-tight uppercase">
                                {selectedFlight.callsign || 'Target Delta'}
                            </h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[9px] font-black border border-blue-500/30">
                                    {selectedFlight.origin_country.toUpperCase()}
                                </span>
                                <span className="text-slate-500 text-[10px] font-mono tracking-widest">{selectedIcao.toUpperCase()}</span>
                            </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button className="text-slate-400 hover:text-yellow-400 p-1.5 bg-slate-800/50 rounded-lg transition-colors border border-slate-700/50">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                            </button>
                            <button onClick={() => setSelectedIcao(null)} className="text-slate-400 hover:text-white p-1.5 bg-slate-800/50 rounded-lg transition-colors border border-slate-700/50">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* Compact Telemetry */}
                    <div className="grid grid-cols-4 gap-px bg-slate-800/50 border-b border-slate-800">
                        {[
                            { label: 'ALT', val: Math.round(selectedFlight.baro_altitude || 0), unit: 'm', color: 'text-white' },
                            { label: 'SPD', val: Math.round(selectedFlight.velocity || 0), unit: 'm/s', color: 'text-white' },
                            { label: 'HDG', val: Math.round(selectedFlight.true_track || 0), unit: '°', color: 'text-white' },
                            { label: 'ROC', val: selectedFlight.vertical_rate || 0, unit: '', color: (selectedFlight.vertical_rate || 0) > 0 ? 'text-emerald-400' : 'text-rose-400' }
                        ].map((item, idx) => (
                            <div key={idx} className="bg-slate-900/40 p-2.5 flex flex-col items-center">
                                <span className="text-[8px] text-slate-500 font-black tracking-[0.2em] mb-1">{item.label}</span>
                                <span className={cn("text-xs font-mono font-bold", item.color)}>
                                    {item.val}<span className="text-[10px] ml-0.5 opacity-50">{item.unit}</span>
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 space-y-4">
                        {/* Status Label */}
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20"></div>
                            <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Live Tracking Active</span>
                            <span className="ml-auto text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-500/20 font-bold">LIVE DATA</span>
                        </div>

                        {/* Aircraft Visual Confirmation */}
                        <div className="relative aspect-[21/9] rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl group">
                            {simData ? (
                                <img src={simData.image_url} alt="Aircraft" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center flex-col text-slate-700 gap-2 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-800 to-slate-950">
                                    <PlaneIcon className="h-8 w-8 opacity-20 animate-pulse" />
                                    <span className="text-[9px] font-mono tracking-widest opacity-40">AWAITING VISUAL FEED</span>
                                </div>
                            )}
                            <div className="absolute top-2 left-2 flex gap-1">
                                <div className="px-1.5 py-0.5 bg-black/60 backdrop-blur rounded text-[8px] text-white/70 font-mono border border-white/10 uppercase tracking-tighter">
                                    {simData ? 'VIS-CONF-99' : 'FEED-OFFLINE'}
                                </div>
                            </div>
                        </div>

                        {!simData ? (
                            /* Premium Unlock UX */
                            <div className="group relative p-6 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden text-center space-y-4 transition-all hover:border-blue-500/30">
                                <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="relative z-10 space-y-4 flex flex-col items-center">
                                    <div className="h-12 w-12 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 group-hover:border-blue-500/50 transition-colors">
                                        <Lock className="h-6 w-6 text-slate-400 group-hover:text-blue-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Secure Data Link</h3>
                                        <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">Intelligence Level 4 Required for Manifest, Maintenance, and Private Owner Details.</p>
                                    </div>
                                    <button
                                        onClick={handleUnlock}
                                        disabled={isUnlocking}
                                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black rounded-lg shadow-xl shadow-blue-900/20 transition-all flex items-center justify-center gap-2 tracking-widest uppercase"
                                    >
                                        {isUnlocking ? 'Bypassing Firewall...' : 'Authorize Access'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 animate-in fade-in duration-500 slide-in-from-bottom-2">

                                {/* Real Registration Section - Always Visible if unlocked */}
                                {simData.registration && (
                                    <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/20 space-y-2 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-1.5">
                                            <span className="text-[7px] bg-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded font-black tracking-tighter border border-emerald-500/30">REAL DATA</span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <PlaneIcon className="h-3 w-3 text-emerald-400" />
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Registry Information</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                            <div>
                                                <div className="text-[8px] text-slate-500 uppercase tracking-widest">Tail Number</div>
                                                <div className="text-white font-mono font-bold mt-0.5">{simData.registration.registration}</div>
                                            </div>
                                            <div>
                                                <div className="text-[8px] text-slate-500 uppercase tracking-widest">Manufacturer</div>
                                                <div className="text-white font-bold mt-0.5 truncate">{simData.registration.manufacturer}</div>
                                            </div>
                                            <div className="col-span-2 pt-1 border-t border-slate-800">
                                                <div className="text-[8px] text-slate-500 uppercase tracking-widest">Aircraft Type</div>
                                                <div className="text-white font-medium mt-0.5">{simData.registration.aircraftType}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Collapsible Intelligence Sections */}
                                {[
                                    {
                                        id: 'manifest',
                                        label: 'Passenger Manifest',
                                        icon: User,
                                        badge: 'PREDICTIVE SIM',
                                        content: (
                                            <div className="space-y-2">
                                                <div className="bg-slate-950/50 rounded-lg border border-slate-800 overflow-hidden">
                                                    {simData.manifest.slice(0, 3).map((p, i) => (
                                                        <div key={i} className="px-3 py-2 flex justify-between items-center text-[11px] border-b border-white/5 last:border-0">
                                                            <div className="flex items-center gap-2">
                                                                <div className={`h-1.5 w-1.5 rounded-full ${p.role === 'Pilot' ? 'bg-purple-400' : 'bg-slate-400'}`}></div>
                                                                <span className="text-slate-300">{p.name}</span>
                                                            </div>
                                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{p.role}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    onClick={() => setShowFullManifest(true)}
                                                    className="w-full py-2 text-[9px] font-black text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-widest"
                                                >
                                                    Open Full Intelligence Report
                                                </button>
                                            </div>
                                        )
                                    },
                                    {
                                        id: 'history',
                                        label: 'Operational History',
                                        icon: Calendar,
                                        badge: 'SIM DATA',
                                        content: (
                                            <div className="bg-slate-950/50 rounded-lg border border-slate-800 p-3 space-y-3">
                                                {simData.owner_chain.map((o, i) => (
                                                    <div key={i} className="flex gap-3 relative last:pb-0">
                                                        {i < simData.owner_chain.length - 1 && (
                                                            <div className="absolute left-[5px] top-4 bottom-[-12px] w-px bg-slate-800"></div>
                                                        )}
                                                        <div className="h-2.5 w-2.5 rounded-full bg-slate-800 border border-slate-700 z-10 mt-1 shrink-0"></div>
                                                        <div className="text-[10px] text-slate-400 font-mono italic">{o}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    },
                                    {
                                        id: 'maintenance',
                                        label: 'Maintenance Vault',
                                        icon: Wrench,
                                        badge: 'SIM DATA',
                                        content: (
                                            <div className="space-y-2">
                                                {simData.maintenance.map((m, i) => (
                                                    <div key={i} className="bg-slate-950/50 rounded-lg border border-slate-800 p-3 flex justify-between items-start gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-[10px] text-slate-200 font-bold uppercase truncate">{m.type}</div>
                                                            <div className="text-[9px] text-slate-500 mt-1 leading-tight">{m.description}</div>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <div className="text-[9px] font-mono text-slate-500 font-bold">{m.date}</div>
                                                            <div className="text-[8px] text-slate-600 mt-1 uppercase truncate max-w-[60px]">{m.mechanic}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    }
                                ].map(section => (
                                    <div key={section.id} className="border-t border-slate-800/50 pt-3">
                                        <button
                                            onClick={() => toggleSection(section.id)}
                                            className="w-full flex items-center justify-between mb-3 group"
                                        >
                                            <div className="flex items-center gap-2">
                                                <section.icon className="h-3 w-3 text-slate-500 group-hover:text-blue-400 transition-colors" />
                                                <span className="text-[10px] font-black text-slate-400 group-hover:text-white transition-colors uppercase tracking-[0.1em]">{section.label}</span>
                                                <span className="text-[8px] bg-slate-800 text-slate-600 px-1 py-0.5 rounded font-bold">{section.badge}</span>
                                            </div>
                                            <div className={cn("transition-transform duration-300", expandedSections[section.id] ? "rotate-180" : "")}>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600"><path d="m6 9 6 6 6-6" /></svg>
                                            </div>
                                        </button>

                                        {expandedSections[section.id] && (
                                            <div className="animate-in fade-in zoom-in-95 duration-200 origin-top">
                                                {section.content}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Security Disclaimer */}
                    <div className="mt-auto p-4 bg-slate-900/80 border-t border-slate-800 flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20">
                            <ShieldAlert className="h-4 w-4 text-red-500" />
                        </div>
                        <p className="text-[8px] text-slate-500 leading-tight uppercase font-mono tracking-tighter">
                            AeroTrack Security Notice: All passenger intelligence and maintenance records are probabilistic simulations based on aircraft performance patterns.
                        </p>
                    </div>
                </div>
            )}

            {/* FULL MANIFEST MODAL */}
            {showFullManifest && simData && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                        onClick={() => setShowFullManifest(false)}
                    ></div>
                    <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900 sticky top-0">
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic flex items-center gap-3">
                                    <User className="h-6 w-6 text-blue-500" /> Intelligence Report: Manifest
                                </h2>
                                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.2em] mt-1">Target ID: {selectedIcao?.toUpperCase()} | CONF-LEVEL: PROBABILISTIC</p>
                            </div>
                            <button
                                onClick={() => setShowFullManifest(false)}
                                className="p-2 hover:bg-slate-800 rounded-full transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                            <div className="grid grid-cols-2 gap-4">
                                {simData.manifest.map((p, i) => (
                                    <div key={i} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-4 group hover:border-blue-500/30 transition-all">
                                        <div className={cn(
                                            "h-10 w-10 rounded shadow-inner flex items-center justify-center text-xs font-black",
                                            p.role === 'Pilot' ? 'bg-purple-500/20 text-purple-400' :
                                                p.role === 'VIP' ? 'bg-yellow-500/20 text-yellow-400' :
                                                    'bg-slate-800 text-slate-400'
                                        )}>
                                            {p.name.split(' ').map(n => n[0]).join('')}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-white truncate">{p.name}</div>
                                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-0.5">{p.role}</div>
                                        </div>
                                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-center">
                                <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em]">End of Manifest Intelligence</p>
                                <p className="text-[9px] text-slate-500 mt-2 italic leading-relaxed">Intelligence generated via neural pattern matching of historical passenger trends and route frequency. Accuracy rating: 74%</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
