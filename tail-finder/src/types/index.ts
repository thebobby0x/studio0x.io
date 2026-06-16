export interface Flight {
    icao24: string;
    callsign: string | null;
    origin_country: string;
    time_position: number | null;
    last_contact: number;
    longitude: number | null;
    latitude: number | null;
    baro_altitude: number | null;
    on_ground: boolean;
    velocity: number | null;
    true_track: number | null;
    vertical_rate: number | null;
    sensors: number[] | null;
    geo_altitude: number | null;
    squawk: string | null;
    spi: boolean;
    position_source: number;
    // Augmented fields
    category?: string; // e.g., 'Heavy', 'Drone' based on logic
}

export interface MapBounds {
    north: number;
    south: number;
    east: number;
    west: number;
}
