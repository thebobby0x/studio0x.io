import { InMemoryCache } from '../cache';

/**
 * hexdb.io API Response Types
 */
export interface HexDBResponse {
    ModeS: string;
    Registration: string;
    Manufacturer: string;
    ICAOTypeCode: string;
    Type: string;
    RegisteredOwners: string;
    OperatorFlagCode: string;
}

/**
 * Enriched Aircraft Registration Data
 */
export interface AircraftRegistration {
    icao24: string;
    registration: string;
    manufacturer: string;
    aircraftType: string;
    owner: string;
    operatorCode: string;
    source: 'hexdb' | 'fallback';
}

const HEXDB_API_BASE = 'https://hexdb.io/api/v1';
const cache = new InMemoryCache<AircraftRegistration>({
    maxSize: 1000,
    ttlMs: 24 * 60 * 60 * 1000 // 24 hours
});

/**
 * Fetch aircraft registration data from hexdb.io
 */
export async function fetchAircraftRegistration(
    icao24: string
): Promise<AircraftRegistration | null> {
    // Normalize ICAO to lowercase
    const normalizedIcao = icao24.toLowerCase();

    // Check cache first
    const cached = cache.get(normalizedIcao);
    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(`${HEXDB_API_BASE}/aircraft/${normalizedIcao}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
            // Don't cache in Next.js - we handle our own caching
            cache: 'no-store',
        });

        if (!response.ok) {
            // API error or aircraft not found
            return null;
        }

        const data: HexDBResponse = await response.json();

        const registration: AircraftRegistration = {
            icao24: normalizedIcao,
            registration: data.Registration,
            manufacturer: data.Manufacturer,
            aircraftType: data.Type,
            owner: data.RegisteredOwners,
            operatorCode: data.OperatorFlagCode,
            source: 'hexdb',
        };

        // Cache the result
        cache.set(normalizedIcao, registration);

        return registration;
    } catch (error) {
        console.error(`Failed to fetch aircraft registration for ${icao24}:`, error);
        return null;
    }
}

/**
 * Get cache statistics (useful for monitoring)
 */
export function getCacheStats() {
    return {
        size: cache.size(),
        maxSize: 1000,
    };
}

/**
 * Clear the aircraft registration cache
 */
export function clearCache() {
    cache.clear();
}
