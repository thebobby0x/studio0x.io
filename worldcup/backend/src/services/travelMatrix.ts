// V2 stub — OAG Team Travel Matrix
// Will link to Mapbox overlay for interactive travel arcs

export interface TeamBasecamp {
  teamCode: string
  teamName: string
  basecampCity: string
  lat: number
  lng: number
}

export interface Venue {
  id: string
  name: string
  city: string
  country: string
  lat: number
  lng: number
}

export const TEAM_BASECAMPS: TeamBasecamp[] = [
  { teamCode: "MEX", teamName: "Mexico",       basecampCity: "Mexico City", lat: 19.4326, lng: -99.1332 },
  { teamCode: "RSA", teamName: "South Africa",  basecampCity: "Los Angeles",  lat: 34.0522, lng: -118.2437 },
  { teamCode: "BRA", teamName: "Brazil",        basecampCity: "Miami",        lat: 25.7617, lng: -80.1918 },
  { teamCode: "ARG", teamName: "Argentina",     basecampCity: "Dallas",       lat: 32.7767, lng: -96.7970 },
  { teamCode: "ESP", teamName: "Spain",         basecampCity: "New York",     lat: 40.7128, lng: -74.0060 },
  { teamCode: "ENG", teamName: "England",       basecampCity: "Boston",       lat: 42.3601, lng: -71.0589 },
];

export const VENUES: Venue[] = [
  { id: "azteca",   name: "Estadio Azteca",      city: "Mexico City", country: "MX", lat: 19.3029, lng: -99.1506 },
  { id: "metlife",  name: "MetLife Stadium",      city: "New York",    country: "US", lat: 40.8135, lng: -74.0744 },
  { id: "atandt",   name: "AT&T Stadium",         city: "Dallas",      country: "US", lat: 32.7480, lng: -97.0931 },
  { id: "sofistadium", name: "SoFi Stadium",      city: "Los Angeles", country: "US", lat: 33.9535, lng: -118.3392 },
  { id: "hardrock", name: "Hard Rock Stadium",    city: "Miami",       country: "US", lat: 25.9580, lng: -80.2389 },
  { id: "bc_place", name: "BC Place",             city: "Vancouver",   country: "CA", lat: 49.2769, lng: -123.1118 },
];

export function getTravelMatrix() {
  // TODO V2: compute flight arcs from OAG API and render on Mapbox
  return { basecamps: TEAM_BASECAMPS, venues: VENUES };
}
