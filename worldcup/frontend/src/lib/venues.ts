export interface VenueInfo {
  city: string;
  country: string;
  capacity: number;
  lat: number;
  lng: number;
  altitudeM: number;
  timezone: string;
  avgJuneTempC: number;
  avgJuneHumidityPct: number;
  didYouKnow: string[];
}

const VENUES: Record<string, VenueInfo> = {
  "MetLife Stadium": {
    city: "New York / NJ", country: "USA", capacity: 82_500,
    lat: 40.8135, lng: -74.0744, altitudeM: 2,
    timezone: "America/New_York",
    avgJuneTempC: 24, avgJuneHumidityPct: 65,
    didYouKnow: [
      "Hosts the 2026 World Cup Final — the biggest match in football history on US soil.",
      "Built on a former landfill in the New Jersey meadowlands at a cost of $1.6 billion.",
      "The only NFL stadium shared by two teams (Giants & Jets) with no naming rights holder until 2010.",
      "Its retractable roof was considered but scrapped — fans watch in the open air year-round.",
      "At 82,500 seats it's the largest stadium in the NFL, visible from the NYC skyline on a clear day.",
    ],
  },
  "AT&T Stadium": {
    city: "Dallas", country: "USA", capacity: 80_000,
    lat: 32.7480, lng: -97.0930, altitudeM: 184,
    timezone: "America/Chicago",
    avgJuneTempC: 32, avgJuneHumidityPct: 60,
    didYouKnow: [
      "Contains the world's largest column-free room — the entire interior has no support columns.",
      "The center-hung video board is 160 yards long, the largest of its kind when installed.",
      "Cost $1.15 billion to build in 2009, earning the nickname 'Jerry World' after Cowboys owner Jerry Jones.",
      "Has hosted Super Bowls, WrestleMania, and NBA All-Star Games in addition to football.",
      "The retractable roof opens in about 12 minutes and the field can be changed in 24 hours.",
    ],
  },
  "SoFi Stadium": {
    city: "Los Angeles", country: "USA", capacity: 70_240,
    lat: 33.9535, lng: -118.3391, altitudeM: 22,
    timezone: "America/Los_Angeles",
    avgJuneTempC: 24, avgJuneHumidityPct: 75,
    didYouKnow: [
      "At $5.5 billion, SoFi Stadium is the most expensive sports venue ever built.",
      "It opened in 2020 — the first NFL regular season games there were played with zero fans due to COVID-19.",
      "The translucent roof protects from sun and rain but is not retractable — LA's mild climate makes it unnecessary.",
      "Hosted Super Bowl LVI, WrestleMania 39, and the 2028 Olympics opening ceremony is planned here.",
      "Named after the financial services company SoFi, which paid $625M for a 20-year naming rights deal.",
    ],
  },
  "Levi's Stadium": {
    city: "San Francisco", country: "USA", capacity: 68_500,
    lat: 37.4033, lng: -121.9694, altitudeM: 14,
    timezone: "America/Los_Angeles",
    avgJuneTempC: 20, avgJuneHumidityPct: 65,
    didYouKnow: [
      "Has a green roof with 1,600 square feet of living plants and 400kW of solar panels.",
      "Situated next to NASA's Moffett Federal Airfield — astronauts and tech executives are regulars.",
      "Named after Levi Strauss & Co., whose iconic jeans were invented in San Francisco during the Gold Rush.",
      "The June weather here is the most temperate of any US World Cup venue, rarely exceeding 24°C.",
      "Tech giants Apple, Google, and Intel are all within a 10-mile radius in Silicon Valley.",
    ],
  },
  "Rose Bowl Stadium": {
    city: "Los Angeles", country: "USA", capacity: 91_136,
    lat: 34.1614, lng: -118.1676, altitudeM: 262,
    timezone: "America/Los_Angeles",
    avgJuneTempC: 28, avgJuneHumidityPct: 45,
    didYouKnow: [
      "Hosted the 1994 World Cup Final where Brazil beat Italy on penalties — the last WC Final here until 2026.",
      "Sits in a natural valley in Pasadena — its 'bowl' shape was carved from the hillside in 1922.",
      "The 94,194-capacity in 1994 set a WC Final attendance record that stood for years.",
      "Diego Maradona retired after Argentina played here in the 1994 WC group stage.",
      "The Rose Bowl Game (New Year's Day college football) has been played here every year since 1902.",
    ],
  },
  "Arrowhead Stadium": {
    city: "Kansas City", country: "USA", capacity: 76_416,
    lat: 39.0489, lng: -94.4839, altitudeM: 290,
    timezone: "America/Chicago",
    avgJuneTempC: 29, avgJuneHumidityPct: 65,
    didYouKnow: [
      "Set the Guinness World Record for loudest outdoor stadium crowd roar at 142.2 decibels in 2014.",
      "Home of the Kansas City Chiefs, winners of multiple Super Bowls under Patrick Mahomes.",
      "The noise level here has been scientifically measured to register as a minor seismic event.",
      "Opened in 1972 — one of the few remaining 'cookie cutter' multi-sport stadium era venues.",
      "Kansas City sits exactly on the border of Kansas and Missouri — two states share the metro area.",
    ],
  },
  "Hard Rock Stadium": {
    city: "Miami", country: "USA", capacity: 65_326,
    lat: 25.9580, lng: -80.2388, altitudeM: 2,
    timezone: "America/New_York",
    avgJuneTempC: 32, avgJuneHumidityPct: 80,
    didYouKnow: [
      "June in Miami averages 80% humidity — easily the most humid World Cup venue in the tournament.",
      "Hosts the Formula 1 Miami Grand Prix, with the racetrack laid out in the stadium parking lot.",
      "Its distinctive floating canopy roof system was added in a $550M renovation in 2016.",
      "Miami has the largest concentration of international banks in the US, reflecting its global character.",
      "Located 8 miles from Miami Beach and 25 miles from the Everglades — a unique geographic pinch point.",
    ],
  },
  "Lincoln Financial Field": {
    city: "Philadelphia", country: "USA", capacity: 69_176,
    lat: 39.9008, lng: -75.1675, altitudeM: 11,
    timezone: "America/New_York",
    avgJuneTempC: 27, avgJuneHumidityPct: 60,
    didYouKnow: [
      "Known as 'The Linc,' it powers itself with 11,000 solar panels and 14 wind turbines — nearly carbon neutral.",
      "Philadelphia is where the US Declaration of Independence was signed in 1776.",
      "The famous Rocky Balboa statue from the 1976 film stands outside the Philadelphia Museum of Art nearby.",
      "Philly fans are legendarily passionate — they once booed Santa Claus at a 1968 Eagles game.",
      "Named after Lincoln National Corporation; the naming rights deal is worth $139.6M over 20 years.",
    ],
  },
  "Lumen Field": {
    city: "Seattle", country: "USA", capacity: 68_740,
    lat: 47.5952, lng: -122.3316, altitudeM: 9,
    timezone: "America/Los_Angeles",
    avgJuneTempC: 18, avgJuneHumidityPct: 70,
    didYouKnow: [
      "Known for the '12th Man' tradition — fans are so loud they've triggered seismic sensors twice.",
      "Seattle in June is the coolest mainland US World Cup venue, averaging just 18°C.",
      "Home of the Seattle Sounders, one of MLS's most passionate supporter cultures.",
      "Sits along Elliott Bay with views of Puget Sound and the Olympic Mountains on clear days.",
      "Amazon, Boeing, Microsoft, and Starbucks all have headquarters in the Seattle metro area.",
    ],
  },
  "NRG Stadium": {
    city: "Houston", country: "USA", capacity: 72_220,
    lat: 29.6847, lng: -95.4107, altitudeM: 15,
    timezone: "America/Chicago",
    avgJuneTempC: 34, avgJuneHumidityPct: 75,
    didYouKnow: [
      "The first NFL stadium with both a retractable roof AND a retractable natural grass field.",
      "Houston is home to NASA's Johnson Space Center — 'Houston, we have a problem' was said 40 miles from here.",
      "June here averages 34°C — the hottest US venue after Miami, making it a significant physical test.",
      "The Houston Livestock Show & Rodeo held here is the world's largest livestock show.",
      "Houston is the most diverse large US city — over 145 languages are spoken here.",
    ],
  },
  "Mercedes-Benz Stadium": {
    city: "Atlanta", country: "USA", capacity: 71_000,
    lat: 33.7554, lng: -84.4008, altitudeM: 303,
    timezone: "America/New_York",
    avgJuneTempC: 29, avgJuneHumidityPct: 65,
    didYouKnow: [
      "Features a unique 8-panel retractable roof that opens like a camera aperture — taking 8 minutes.",
      "The halo video board is 58 feet tall, 1,100 feet in circumference — largest in any domed stadium.",
      "Atlanta is the birthplace of Martin Luther King Jr. and Coca-Cola.",
      "Cost $1.5 billion and won the Outstanding Sports Facility award from Stadium Journey.",
      "Home to both the Atlanta Falcons (NFL) and Atlanta United FC — the only stadium shared in this way.",
    ],
  },
  "Gillette Stadium": {
    city: "Boston", country: "USA", capacity: 65_878,
    lat: 42.0909, lng: -71.2643, altitudeM: 31,
    timezone: "America/New_York",
    avgJuneTempC: 23, avgJuneHumidityPct: 65,
    didYouKnow: [
      "Home of the New England Patriots, who won 6 Super Bowls here in the Brady-Belichick era.",
      "Its two lighthouse towers are a deliberate homage to New England's maritime heritage.",
      "Boston is home to Harvard, MIT, and over 100 colleges — it's the most educated city in the US.",
      "The Boston Marathon, world's oldest annual marathon, finishes 25 miles away on Boylston Street.",
      "Located in Foxborough — named after a farmer named Thomas Fox who lived here in the 1700s.",
    ],
  },
  "BC Place": {
    city: "Vancouver", country: "Canada", capacity: 54_500,
    lat: 49.2775, lng: -123.1115, altitudeM: 3,
    timezone: "America/Vancouver",
    avgJuneTempC: 18, avgJuneHumidityPct: 70,
    didYouKnow: [
      "Canada's only retractable roof stadium — the air-supported roof is the largest of its type ever built.",
      "Hosted the opening and closing ceremonies of the 2010 Winter Olympics.",
      "Vancouver is surrounded by mountains and ocean — ski slopes are 30 minutes from downtown.",
      "The city has been ranked the world's most liveable city multiple times by The Economist.",
      "Vancouver's Chinatown is the third largest in North America, reflecting the city's deep Asian heritage.",
    ],
  },
  "BMO Field": {
    city: "Toronto", country: "Canada", capacity: 45_000,
    lat: 43.6333, lng: -79.4184, altitudeM: 76,
    timezone: "America/Toronto",
    avgJuneTempC: 22, avgJuneHumidityPct: 70,
    didYouKnow: [
      "The smallest stadium in the 2026 World Cup — but the only one situated on a Great Lakes waterfront.",
      "Home of Toronto FC, who won the MLS Cup in 2017 in a historic season.",
      "Toronto is the most multicultural city on Earth — over 200 languages are spoken here.",
      "Named after BMO Financial Group; sits on the historic Canadian National Exhibition grounds.",
      "The CN Tower, 1.1 km tall, is visible from the stadium — once the world's tallest free-standing structure.",
    ],
  },
  "Estadio Azteca": {
    city: "Mexico City", country: "Mexico", capacity: 87_523,
    lat: 19.3029, lng: -99.1505, altitudeM: 2_250,
    timezone: "America/Mexico_City",
    avgJuneTempC: 16, avgJuneHumidityPct: 55,
    didYouKnow: [
      "At 2,250m above sea level, Azteca is the highest-altitude WC 2026 venue — low oxygen affects player stamina.",
      "Hosted the 1970 AND 1986 World Cups — the only stadium to host two finals.",
      "Maradona's 'Hand of God' and 'Goal of the Century' were both scored here in the 1986 quarter-final.",
      "Capacity of 87,523 makes it one of the largest football stadiums in the Americas.",
      "The thin air at altitude means the ball travels ~10% faster and farther than at sea level.",
    ],
  },
  "Estadio BBVA": {
    city: "Monterrey", country: "Mexico", capacity: 51_000,
    lat: 25.6693, lng: -100.3119, altitudeM: 535,
    timezone: "America/Monterrey",
    avgJuneTempC: 33, avgJuneHumidityPct: 55,
    didYouKnow: [
      "Opened in 2015 with the iconic Cerro de la Silla mountain as a natural backdrop behind one goal.",
      "Monterrey is Mexico's wealthiest and most industrialized city — home to CEMEX, FEMSA, and Banorte.",
      "June temperatures here regularly exceed 35°C — expect afternoon thunderstorms cooling things down.",
      "The stadium design was inspired by a volcanic crater, sloping down to hug the natural terrain.",
      "Monterrey is just 130 miles from the US-Mexico border at Laredo, Texas.",
    ],
  },
  "Estadio Akron": {
    city: "Guadalajara", country: "Mexico", capacity: 49_850,
    lat: 20.6763, lng: -103.4488, altitudeM: 1_568,
    timezone: "America/Mexico_City",
    avgJuneTempC: 22, avgJuneHumidityPct: 55,
    didYouKnow: [
      "Guadalajara sits at 1,568m — the second highest altitude in the tournament after Estadio Azteca.",
      "Home of Club Deportivo Guadalajara (Chivas) — the only Mexican club that only signs Mexican players.",
      "The town of Tequila, where all tequila must legally be produced, is just 65km northwest of the stadium.",
      "Guadalajara is the birthplace of mariachi music and the Mexican Hat Dance (Jarabe Tapatío).",
      "Known as Mexico's Silicon Valley — the Guadalajara tech cluster includes Intel, Oracle, and IBM offices.",
    ],
  },
};

// Alternative names football-data.org or other sources may use
const ALIASES: Record<string, string> = {
  "Rose Bowl":                   "Rose Bowl Stadium",
  "Levis Stadium":               "Levi's Stadium",
  "Levi Stadium":                "Levi's Stadium",
  "Lincoln Financial":           "Lincoln Financial Field",
  "MetLife":                     "MetLife Stadium",
  "Arrowhead":                   "Arrowhead Stadium",
  "Hard Rock":                   "Hard Rock Stadium",
  "NRG":                         "NRG Stadium",
  "Mercedes Benz Stadium":       "Mercedes-Benz Stadium",
  "Gillette":                    "Gillette Stadium",
  "SoFi":                        "SoFi Stadium",
  "Estadio Azteca":              "Estadio Azteca",
  "Azteca":                      "Estadio Azteca",
  "BBVA Stadium":                "Estadio BBVA",
  "Estadio BBVA Bancomer":       "Estadio BBVA",
  "Akron Stadium":               "Estadio Akron",
  "Estadio Chivas":              "Estadio Akron",
  "BC Place Stadium":            "BC Place",
  "BMO":                         "BMO Field",
};

function canonicalize(name: string): string {
  if (VENUES[name]) return name;
  if (ALIASES[name]) return ALIASES[name];
  const lower = name.toLowerCase();
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (lower.includes(alias.toLowerCase())) return canonical;
  }
  for (const key of Object.keys(VENUES)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return key;
  }
  return name;
}

export function getVenueInfo(venueName: string): VenueInfo | null {
  if (!venueName) return null;
  const canonical = canonicalize(venueName);
  return VENUES[canonical] ?? null;
}

export function venueCity(venueName: string, fallbackCity: string): string {
  return getVenueInfo(venueName)?.city ?? (fallbackCity && fallbackCity !== "Host City" ? fallbackCity : "");
}

export function getAllVenues(): Array<VenueInfo & { name: string }> {
  return Object.entries(VENUES).map(([name, info]) => ({ name, ...info }));
}
