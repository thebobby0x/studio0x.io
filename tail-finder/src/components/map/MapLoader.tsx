'use client';

import dynamic from 'next/dynamic';

const Map = dynamic(() => import('./Map'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-500 font-mono animate-pulse">
            INITIALIZING SATELLITE UPLINK...
        </div>
    )
});

export default function MapLoader() {
    return <Map />;
}
