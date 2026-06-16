import { Flight, MapBounds } from "@/types";

const OPENSKY_API_URL = "https://opensky-network.org/api/states/all";

// OpenSky public API has rate limits (anonymous: 10s wait, authenticated: 5s).
// We will use anonymous for now, but handle limits gracefully.

export async function fetchFlights(bounds?: MapBounds): Promise<Flight[]> {
    try {
        let url = OPENSKY_API_URL;
        if (bounds) {
            url += `?lamin=${bounds.south}&lomin=${bounds.west}&lamax=${bounds.north}&lomax=${bounds.east}`;
        }

        const response = await fetch(url, {
            method: "GET",
            // Next.js caching behavior - we want fresh data
            cache: "no-store",
        });

        if (!response.ok) {
            console.warn("OpenSky API limited or error:", response.status);
            return [];
        }

        const data = await response.json();

        // OpenSky returns an array of arrays. We map it to our object.
        // Index mapping based on OpenSky docs:
        // 0: icao24, 1: callsign, 2: origin_country, 3: time_position, 4: last_contact, 
        // 5: longitude, 6: latitude, 7: baro_altitude, 8: on_ground, 9: velocity, 
        // 10: true_track, 11: vertical_rate, 12: sensors, 13: geo_altitude, 14: squawk, 
        // 15: spi, 16: position_source

        if (!data.states) return [];

        return data.states.map((s: any) => ({
            icao24: s[0],
            callsign: s[1]?.trim(),
            origin_country: s[2],
            time_position: s[3],
            last_contact: s[4],
            longitude: s[5],
            latitude: s[6],
            baro_altitude: s[7],
            on_ground: s[8],
            velocity: s[9],
            true_track: s[10],
            vertical_rate: s[11],
            sensors: s[12],
            geo_altitude: s[13],
            squawk: s[14],
            spi: s[15],
            position_source: s[16],
        })).filter((f: Flight) => f.latitude !== null && f.longitude !== null); // Filter out planes without position

    } catch (error) {
        console.error("Failed to fetch flights", error);
        return [];
    }
}
