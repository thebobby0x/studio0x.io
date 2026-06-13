export interface VenueInfo {
  city: string;
  country: string;
  capacity: number;
}

const VENUES: Record<string, VenueInfo> = {
  // USA
  "MetLife Stadium":        { city: "New York / NJ",    country: "USA",    capacity: 82_500 },
  "AT&T Stadium":           { city: "Dallas",            country: "USA",    capacity: 80_000 },
  "SoFi Stadium":           { city: "Los Angeles",       country: "USA",    capacity: 70_240 },
  "Levi's Stadium":         { city: "San Francisco",     country: "USA",    capacity: 68_500 },
  "Rose Bowl Stadium":      { city: "Los Angeles",       country: "USA",    capacity: 91_136 },
  "Rose Bowl":              { city: "Los Angeles",       country: "USA",    capacity: 91_136 },
  "Arrowhead Stadium":      { city: "Kansas City",       country: "USA",    capacity: 76_416 },
  "Hard Rock Stadium":      { city: "Miami",             country: "USA",    capacity: 65_326 },
  "Lincoln Financial Field":{ city: "Philadelphia",      country: "USA",    capacity: 69_176 },
  "Lumen Field":            { city: "Seattle",           country: "USA",    capacity: 68_740 },
  "NRG Stadium":            { city: "Houston",           country: "USA",    capacity: 72_220 },
  "Mercedes-Benz Stadium":  { city: "Atlanta",           country: "USA",    capacity: 71_000 },
  "Gillette Stadium":       { city: "Boston",            country: "USA",    capacity: 65_878 },
  // Canada
  "BC Place":               { city: "Vancouver",         country: "Canada", capacity: 54_500 },
  "BMO Field":              { city: "Toronto",           country: "Canada", capacity: 45_000 },
  // Mexico
  "Estadio Azteca":         { city: "Mexico City",       country: "Mexico", capacity: 87_523 },
  "Estadio BBVA":           { city: "Monterrey",         country: "Mexico", capacity: 51_000 },
  "Estadio Akron":          { city: "Guadalajara",       country: "Mexico", capacity: 49_850 },
};

export function getVenueInfo(venueName: string): VenueInfo | null {
  if (!venueName) return null;
  if (VENUES[venueName]) return VENUES[venueName];
  const lower = venueName.toLowerCase();
  for (const [k, v] of Object.entries(VENUES)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }
  return null;
}

export function venueCity(venueName: string, fallbackCity: string): string {
  return getVenueInfo(venueName)?.city ?? (fallbackCity === "Host City" ? "" : fallbackCity);
}
