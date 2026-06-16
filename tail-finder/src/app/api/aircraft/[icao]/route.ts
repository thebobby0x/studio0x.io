
import { NextResponse } from 'next/server';
import { fetchAircraftRegistration } from '@/lib/api/aircraft-registry';

// Types (copied/adapted from simulation.ts)
interface ManifestItem {
    name: string;
    role: 'Pilot' | 'Co-Pilot' | 'Crew' | 'Passenger' | 'VIP';
    status: 'Checked-In' | 'Onboard' | 'Verified';
}

interface MaintenanceLog {
    date: string;
    type: 'Routine' | 'Urgent' | 'Modification';
    description: string;
    mechanic: string;
}

interface DeepHistory {
    owner_chain: string[];
    manifest: ManifestItem[];
    maintenance: MaintenanceLog[];
    image_url: string;
    registration?: {
        icao24: string;
        registration: string;
        manufacturer: string;
        aircraftType: string;
        owner: string;
        operatorCode: string;
        source: 'hexdb' | 'fallback';
    };
}

// Data Pools
const FIRST_NAMES = ["John", "Sarah", "Michael", "Elena", "David", "Wei", "Arthur", "James", "Robert", "Maria", "Sofia", "Daniel"];
const LAST_NAMES = ["Smith", "Chen", "Mueller", "Rodriguez", "Bond", "Stark", "Wayne", "Murdock", "Kowalski", "Dubois", "Kim"];

// Seeded Random Helper
class SeededRandom {
    private seed: number;

    constructor(seed: string) {
        // Simple hash to number
        let h = 0xdeadbeef;
        for (let i = 0; i < seed.length; i++) {
            h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
            h = ((h ^ h >>> 16) >>> 0) * 2246822507;
            h = ((h ^ h >>> 13) >>> 0) * 3266489909;
            h = (h ^ h >>> 16) >>> 0;
        }
        this.seed = h;
    }

    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }

    element<T>(arr: T[]): T {
        return arr[Math.floor(this.next() * arr.length)];
    }

    number(min: number, max: number): number {
        return Math.floor(this.next() * (max - min) + min);
    }
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ icao: string }> }
) {
    const { icao } = await params;
    const rng = new SeededRandom(icao);

    // Simulate "Real" API Latency
    await new Promise(resolve => setTimeout(resolve, rng.number(300, 800)));

    // Fetch REAL aircraft registration data from hexdb.io
    const realRegistration = await fetchAircraftRegistration(icao);

    // Determine if private based on real data or fallback to random
    const isPrivate = realRegistration
        ? realRegistration.registration.startsWith('N') // US registrations starting with N are often private
        : rng.next() > 0.3; // Fallback to 70% private

    // Generate SIMULATED manifest (real manifest data is not publicly available)
    const manifest: ManifestItem[] = [
        { name: `Capt. ${rng.element(FIRST_NAMES)} ${rng.element(LAST_NAMES)}`, role: 'Pilot', status: 'Onboard' },
        { name: `FO ${rng.element(FIRST_NAMES)} ${rng.element(LAST_NAMES)}`, role: 'Co-Pilot', status: 'Onboard' },
    ];

    if (isPrivate) {
        const vipCount = rng.number(1, 6);
        for (let i = 0; i < vipCount; i++) {
            manifest.push({
                name: `${rng.element(FIRST_NAMES)} ${rng.element(LAST_NAMES)}`,
                role: 'VIP',
                status: 'Onboard'
            });
        }
    } else {
        manifest.push({ name: `${rng.number(50, 250)} Pax (See Full List)`, role: 'Passenger', status: 'Checked-In' });
    }

    // Build ownership chain with REAL data if available
    const owners = realRegistration
        ? [
            `Current: ${realRegistration.owner}`,
            '2018-2023: SkyLease Capital', // Simulated historic data
            '2010-2018: Original Manufacturing Co.', // Simulated historic data
        ]
        : [
            'Current: ' + (isPrivate ? 'Prestige Air Charter LLC' : 'Global Airlines Inc.'),
            '2018-2023: SkyLease Capital',
            '2010-2018: Original Manufacturing Co.',
        ];

    // Generate SIMULATED maintenance logs (real maintenance data is not publicly available)
    const logs: MaintenanceLog[] = [
        { date: '2025-12-10', type: 'Routine', description: 'Annual Inspection & Avionics Check', mechanic: 'AeroFix Inc.' },
        { date: '2025-08-15', type: 'Modification', description: 'SatCom Upgrade Installation', mechanic: 'TechnicAir' },
    ];

    if (rng.next() > 0.8) {
        logs.unshift({ date: '2026-01-05', type: 'Urgent', description: 'Landing Gear Seal Replacement', mechanic: 'Field Support' });
    }

    // Use a fixed image for consistency
    const image_url = `https://images.unsplash.com/photo-1559087867-ce4c91325525?q=80&w=800`;

    const data: DeepHistory = {
        owner_chain: owners,
        manifest,
        maintenance: logs,
        image_url,
        registration: realRegistration || undefined, // Include real registration data if available
    };

    return NextResponse.json(data);
}
