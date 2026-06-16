import { Flight } from "@/types";
import { AircraftRegistration } from "./api/aircraft-registry";

export interface ManifestItem {
    name: string;
    role: 'Pilot' | 'Co-Pilot' | 'Crew' | 'Passenger' | 'VIP';
    status: 'Checked-In' | 'Onboard' | 'Verified';
}

export interface MaintenanceLog {
    date: string;
    type: 'Routine' | 'Urgent' | 'Modification';
    description: string;
    mechanic: string;
}

export interface DeepHistory {
    owner_chain: string[];
    manifest: ManifestItem[];
    maintenance: MaintenanceLog[];
    image_url: string;
    // Real aircraft data (if available)
    registration?: AircraftRegistration;
}

const FIRST_NAMES = ["John", "Sarah", "Michael", "Elena", "David", "Wei", "Arthur", "James", "Robert"];
const LAST_NAMES = ["Smith", "Chen", "Mueller", "Rodriguez", "Bond", "Stark", "Wayne", "Murdock"];
const ROLES: ('Passenger' | 'VIP')[] = ['Passenger', 'VIP'];

function randomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function generateSimulationData(flight: Flight): DeepHistory {
    // Deterministic-ish generation based on ICAO so it stays consistent for the same session
    // In reality, random is fine for a demo

    const isPrivate = !flight.callsign || flight.callsign.startsWith('N');

    const manifest: ManifestItem[] = [
        { name: `Capt. ${randomElement(FIRST_NAMES)} ${randomElement(LAST_NAMES)}`, role: 'Pilot', status: 'Onboard' },
        { name: `FO ${randomElement(FIRST_NAMES)} ${randomElement(LAST_NAMES)}`, role: 'Co-Pilot', status: 'Onboard' },
    ];

    if (isPrivate) {
        // Generate VIPs
        const vipCount = Math.floor(Math.random() * 4) + 1;
        for (let i = 0; i < vipCount; i++) {
            manifest.push({
                name: `${randomElement(FIRST_NAMES)} ${randomElement(LAST_NAMES)}`,
                role: 'VIP',
                status: 'Onboard'
            });
        }
    } else {
        // Generate Passengers
        manifest.push({ name: `${Math.floor(Math.random() * 150) + 50} Pax (See Full List)`, role: 'Passenger', status: 'Checked-In' });
    }

    const logs: MaintenanceLog[] = [
        { date: '2025-12-10', type: 'Routine', description: 'Annual Inspection & Avionics Check', mechanic: 'AeroFix Inc.' },
        { date: '2025-08-15', type: 'Modification', description: 'SatCom Upgrade Installation', mechanic: 'TechnicAir' },
        { date: '2025-01-20', type: 'Urgent', description: 'Hydraulic Seal Replacement', mechanic: 'Field Support' },
    ];

    const owners = [
        'Current: ' + (isPrivate ? 'Prestige Air Charter LLC' : 'Global Airlines Inc.'),
        '2018-2023: SkyLease Capital',
        '2010-2018: Original Manufacturing Co.',
    ];

    // Random placeholder image from Unsplash
    // Using keywords 'jet', 'plane', 'aircraft'
    const image_url = `https://source.unsplash.com/800x600/?private-jet,aircraft&sig=${flight.icao24}`;

    return {
        manifest,
        maintenance: logs,
        owner_chain: owners,
        image_url
    };
}
