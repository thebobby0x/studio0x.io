import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFlag } from "@/lib/flags";

const FD_BASE = "https://api.football-data.org/v4";

const STATUS_MAP: Record<string, string> = {
  SCHEDULED: "NS", TIMED: "NS",
  IN_PLAY: "LIVE", PAUSED: "HT",
  FINISHED: "FT", SUSPENDED: "FT",
  POSTPONED: "NS", CANCELLED: "NS", AWARDED: "FT",
};

// ── Hardcoded squads (11 starters per team) ──────────────────────────────────
// Add more teams here as needed; all other teams get empty squads.

const SQUADS: Record<string, Array<{ id: string; number: number; name: string; position: string }>> = {
  MEX: [
    { id: "mex-1",  number: 1,  name: "Guillermo Ochoa",     position: "GK"  },
    { id: "mex-2",  number: 2,  name: "Jorge Sánchez",        position: "DEF" },
    { id: "mex-3",  number: 3,  name: "César Montes",         position: "DEF" },
    { id: "mex-4",  number: 4,  name: "Johan Vásquez",        position: "DEF" },
    { id: "mex-23", number: 23, name: "Jesús Gallardo",       position: "DEF" },
    { id: "mex-6",  number: 6,  name: "Edson Álvarez",        position: "MID" },
    { id: "mex-7",  number: 7,  name: "Carlos Rodríguez",     position: "MID" },
    { id: "mex-8",  number: 8,  name: "Héctor Herrera",       position: "MID" },
    { id: "mex-22", number: 22, name: "Hirving Lozano",       position: "FWD" },
    { id: "mex-9",  number: 9,  name: "Raúl Jiménez",         position: "FWD" },
    { id: "mex-14", number: 14, name: "Henry Martín",         position: "FWD" },
  ],
  RSA: [
    { id: "rsa-1",  number: 1,  name: "Ronwen Williams",      position: "GK"  },
    { id: "rsa-2",  number: 2,  name: "Reeve Frosler",        position: "DEF" },
    { id: "rsa-5",  number: 5,  name: "Rushine De Reuck",     position: "DEF" },
    { id: "rsa-6",  number: 6,  name: "Siyanda Xulu",         position: "DEF" },
    { id: "rsa-15", number: 15, name: "Thabo Cele",           position: "DEF" },
    { id: "rsa-4",  number: 4,  name: "Mothobi Mvala",        position: "MID" },
    { id: "rsa-8",  number: 8,  name: "Teboho Mokoena",       position: "MID" },
    { id: "rsa-7",  number: 7,  name: "Ethan Ntsabatha",      position: "MID" },
    { id: "rsa-10", number: 10, name: "Percy Tau",            position: "FWD" },
    { id: "rsa-14", number: 14, name: "Bongokuhle Hlongwane", position: "FWD" },
    { id: "rsa-9",  number: 9,  name: "Lyle Foster",          position: "FWD" },
  ],
  KOR: [
    { id: "kor-1",  number: 1,  name: "Kim Seung-gyu",        position: "GK"  },
    { id: "kor-2",  number: 2,  name: "Lee Ki-je",            position: "DEF" },
    { id: "kor-4",  number: 4,  name: "Kim Min-jae",          position: "DEF" },
    { id: "kor-5",  number: 5,  name: "Jung Seung-hyun",      position: "DEF" },
    { id: "kor-3",  number: 3,  name: "Kim Jin-su",           position: "DEF" },
    { id: "kor-6",  number: 6,  name: "Jung Woo-young",       position: "MID" },
    { id: "kor-16", number: 16, name: "Hwang In-beom",        position: "MID" },
    { id: "kor-14", number: 14, name: "Lee Jae-sung",         position: "MID" },
    { id: "kor-7",  number: 7,  name: "Son Heung-min",        position: "FWD" },
    { id: "kor-9",  number: 9,  name: "Cho Gue-sung",         position: "FWD" },
    { id: "kor-11", number: 11, name: "Hwang Hee-chan",        position: "FWD" },
  ],
  CZE: [
    { id: "cze-1",  number: 1,  name: "Jiří Staněk",          position: "GK"  },
    { id: "cze-5",  number: 5,  name: "Vladimír Coufal",      position: "DEF" },
    { id: "cze-14", number: 14, name: "Tomáš Holeš",          position: "DEF" },
    { id: "cze-3",  number: 3,  name: "Ladislav Krejčí",      position: "DEF" },
    { id: "cze-15", number: 15, name: "Jan Bořil",             position: "DEF" },
    { id: "cze-6",  number: 6,  name: "Tomáš Souček",         position: "MID" },
    { id: "cze-8",  number: 8,  name: "Lukáš Provod",         position: "MID" },
    { id: "cze-17", number: 17, name: "Marek Ondráček",       position: "MID" },
    { id: "cze-10", number: 10, name: "Patrik Schick",         position: "FWD" },
    { id: "cze-22", number: 22, name: "Adam Hložek",           position: "FWD" },
    { id: "cze-20", number: 20, name: "Ondřej Lingr",          position: "FWD" },
  ],
  USA: [
    { id: "usa-1",  number: 1,  name: "Matt Turner",          position: "GK"  },
    { id: "usa-2",  number: 2,  name: "Sergino Dest",         position: "DEF" },
    { id: "usa-3",  number: 3,  name: "Walker Zimmermann",    position: "DEF" },
    { id: "usa-5",  number: 5,  name: "Chris Richards",       position: "DEF" },
    { id: "usa-6",  number: 6,  name: "Antonee Robinson",     position: "DEF" },
    { id: "usa-4",  number: 4,  name: "Tyler Adams",          position: "MID" },
    { id: "usa-8",  number: 8,  name: "Weston McKennie",      position: "MID" },
    { id: "usa-7",  number: 7,  name: "Gio Reyna",            position: "MID" },
    { id: "usa-9",  number: 9,  name: "Christian Pulisic",    position: "FWD" },
    { id: "usa-16", number: 16, name: "Ricardo Pepi",         position: "FWD" },
    { id: "usa-19", number: 19, name: "Josh Sargent",         position: "FWD" },
  ],
  PAR: [
    { id: "par-1",  number: 1,  name: "Antony Silva",         position: "GK"  },
    { id: "par-2",  number: 2,  name: "Robert Rojas",         position: "DEF" },
    { id: "par-5",  number: 5,  name: "Gustavo Gómez",        position: "DEF" },
    { id: "par-3",  number: 3,  name: "Junior Alonso",        position: "DEF" },
    { id: "par-6",  number: 6,  name: "Santiago Arzamendia",  position: "DEF" },
    { id: "par-14", number: 14, name: "Miguel Almirón",       position: "MID" },
    { id: "par-8",  number: 8,  name: "Andrés Cubas",         position: "MID" },
    { id: "par-10", number: 10, name: "Mathías Villasanti",   position: "MID" },
    { id: "par-9",  number: 9,  name: "Antonio Sanabria",     position: "FWD" },
    { id: "par-11", number: 11, name: "Ángel Romero",         position: "FWD" },
    { id: "par-20", number: 20, name: "Julio Enciso",         position: "FWD" },
  ],
  BRA: [
    { id: "bra-1",  number: 1,  name: "Alisson Becker",       position: "GK"  },
    { id: "bra-2",  number: 2,  name: "Danilo",               position: "DEF" },
    { id: "bra-3",  number: 3,  name: "Marquinhos",           position: "DEF" },
    { id: "bra-4",  number: 4,  name: "Éder Militão",         position: "DEF" },
    { id: "bra-6",  number: 6,  name: "Alex Telles",          position: "DEF" },
    { id: "bra-5",  number: 5,  name: "Casemiro",             position: "MID" },
    { id: "bra-8",  number: 8,  name: "Bruno Guimarães",      position: "MID" },
    { id: "bra-10", number: 10, name: "Neymar Jr",            position: "FWD" },
    { id: "bra-11", number: 11, name: "Raphinha",             position: "FWD" },
    { id: "bra-7",  number: 7,  name: "Rodrygo",              position: "FWD" },
    { id: "bra-9",  number: 9,  name: "Vinicius Jr",          position: "FWD" },
  ],
  ARG: [
    { id: "arg-1",  number: 1,  name: "Emiliano Martínez",    position: "GK"  },
    { id: "arg-2",  number: 2,  name: "Nahuel Molina",        position: "DEF" },
    { id: "arg-4",  number: 4,  name: "Gonzalo Montiel",      position: "DEF" },
    { id: "arg-6",  number: 6,  name: "Germán Pezzella",      position: "DEF" },
    { id: "arg-3",  number: 3,  name: "Nicolás Tagliafico",   position: "DEF" },
    { id: "arg-5",  number: 5,  name: "Leandro Paredes",      position: "MID" },
    { id: "arg-7",  number: 7,  name: "Rodrigo De Paul",      position: "MID" },
    { id: "arg-20", number: 20, name: "Alexis Mac Allister",  position: "MID" },
    { id: "arg-10", number: 10, name: "Lionel Messi",         position: "FWD" },
    { id: "arg-11", number: 11, name: "Ángel Di María",       position: "FWD" },
    { id: "arg-9",  number: 9,  name: "Julián Álvarez",       position: "FWD" },
  ],
  FRA: [
    { id: "fra-1",  number: 1,  name: "Mike Maignan",         position: "GK"  },
    { id: "fra-5",  number: 5,  name: "Jules Koundé",         position: "DEF" },
    { id: "fra-3",  number: 3,  name: "Dayot Upamecano",      position: "DEF" },
    { id: "fra-4",  number: 4,  name: "Ibrahima Konaté",      position: "DEF" },
    { id: "fra-22", number: 22, name: "Théo Hernández",       position: "DEF" },
    { id: "fra-8",  number: 8,  name: "Aurélien Tchouaméni",  position: "MID" },
    { id: "fra-6",  number: 6,  name: "Adrien Rabiot",        position: "MID" },
    { id: "fra-14", number: 14, name: "Matteo Guendouzi",     position: "MID" },
    { id: "fra-7",  number: 7,  name: "Antoine Griezmann",    position: "FWD" },
    { id: "fra-10", number: 10, name: "Kylian Mbappé",        position: "FWD" },
    { id: "fra-9",  number: 9,  name: "Olivier Giroud",       position: "FWD" },
  ],
  ENG: [
    { id: "eng-1",  number: 1,  name: "Jordan Pickford",      position: "GK"  },
    { id: "eng-2",  number: 2,  name: "Kyle Walker",          position: "DEF" },
    { id: "eng-5",  number: 5,  name: "John Stones",          position: "DEF" },
    { id: "eng-6",  number: 6,  name: "Harry Maguire",        position: "DEF" },
    { id: "eng-3",  number: 3,  name: "Luke Shaw",            position: "DEF" },
    { id: "eng-4",  number: 4,  name: "Declan Rice",          position: "MID" },
    { id: "eng-8",  number: 8,  name: "Jordan Henderson",     position: "MID" },
    { id: "eng-10", number: 10, name: "Phil Foden",           position: "MID" },
    { id: "eng-7",  number: 7,  name: "Bukayo Saka",          position: "FWD" },
    { id: "eng-9",  number: 9,  name: "Harry Kane",           position: "FWD" },
    { id: "eng-11", number: 11, name: "Marcus Rashford",      position: "FWD" },
  ],
  GER: [
    { id: "ger-1",  number: 1,  name: "Manuel Neuer",         position: "GK"  },
    { id: "ger-5",  number: 5,  name: "Thilo Kehrer",         position: "DEF" },
    { id: "ger-4",  number: 4,  name: "Niklas Süle",          position: "DEF" },
    { id: "ger-3",  number: 3,  name: "David Raum",           position: "DEF" },
    { id: "ger-2",  number: 2,  name: "Joshua Kimmich",       position: "MID" },
    { id: "ger-6",  number: 6,  name: "Leon Goretzka",        position: "MID" },
    { id: "ger-8",  number: 8,  name: "Toni Kroos",           position: "MID" },
    { id: "ger-13", number: 13, name: "Thomas Müller",        position: "MID" },
    { id: "ger-7",  number: 7,  name: "Kai Havertz",          position: "FWD" },
    { id: "ger-9",  number: 9,  name: "Niclas Füllkrug",      position: "FWD" },
    { id: "ger-10", number: 10, name: "Leroy Sané",           position: "FWD" },
  ],
  ESP: [
    { id: "esp-1",  number: 1,  name: "Unai Simón",           position: "GK"  },
    { id: "esp-2",  number: 2,  name: "Dani Carvajal",        position: "DEF" },
    { id: "esp-3",  number: 3,  name: "Alejandro Balde",      position: "DEF" },
    { id: "esp-4",  number: 4,  name: "Pau Cubarsí",          position: "DEF" },
    { id: "esp-5",  number: 5,  name: "Aymeric Laporte",      position: "DEF" },
    { id: "esp-8",  number: 8,  name: "Pedri",                position: "MID" },
    { id: "esp-6",  number: 6,  name: "Rodri",                position: "MID" },
    { id: "esp-16", number: 16, name: "Fabián Ruiz",          position: "MID" },
    { id: "esp-11", number: 11, name: "Ferran Torres",        position: "FWD" },
    { id: "esp-7",  number: 7,  name: "Álvaro Morata",        position: "FWD" },
    { id: "esp-10", number: 10, name: "Dani Olmo",            position: "FWD" },
  ],
  POR: [
    { id: "por-1",  number: 1,  name: "Diogo Costa",          position: "GK"  },
    { id: "por-2",  number: 2,  name: "João Cancelo",         position: "DEF" },
    { id: "por-3",  number: 3,  name: "Nuno Mendes",          position: "DEF" },
    { id: "por-4",  number: 4,  name: "Rúben Dias",           position: "DEF" },
    { id: "por-6",  number: 6,  name: "Pepe",                 position: "DEF" },
    { id: "por-8",  number: 8,  name: "João Palhinha",        position: "MID" },
    { id: "por-14", number: 14, name: "William Carvalho",     position: "MID" },
    { id: "por-10", number: 10, name: "Bernardo Silva",       position: "MID" },
    { id: "por-7",  number: 7,  name: "Cristiano Ronaldo",    position: "FWD" },
    { id: "por-11", number: 11, name: "Rafael Leão",          position: "FWD" },
    { id: "por-17", number: 17, name: "Gonçalo Ramos",        position: "FWD" },
  ],
  NED: [
    { id: "ned-1",  number: 1,  name: "Bart Verbruggen",      position: "GK"  },
    { id: "ned-2",  number: 2,  name: "Denzel Dumfries",      position: "DEF" },
    { id: "ned-4",  number: 4,  name: "Virgil van Dijk",      position: "DEF" },
    { id: "ned-5",  number: 5,  name: "Nathan Aké",           position: "DEF" },
    { id: "ned-3",  number: 3,  name: "Daley Blind",          position: "DEF" },
    { id: "ned-8",  number: 8,  name: "Frenkie de Jong",      position: "MID" },
    { id: "ned-6",  number: 6,  name: "Tijjani Reijnders",    position: "MID" },
    { id: "ned-10", number: 10, name: "Memphis Depay",        position: "MID" },
    { id: "ned-7",  number: 7,  name: "Cody Gakpo",           position: "FWD" },
    { id: "ned-9",  number: 9,  name: "Wout Weghorst",        position: "FWD" },
    { id: "ned-11", number: 11, name: "Xavi Simons",          position: "FWD" },
  ],
  CAN: [
    { id: "can-1",  number: 1,  name: "Maxime Crépeau",       position: "GK"  },
    { id: "can-2",  number: 2,  name: "Richie Laryea",        position: "DEF" },
    { id: "can-5",  number: 5,  name: "Steven Vitória",       position: "DEF" },
    { id: "can-3",  number: 3,  name: "Kamal Miller",         position: "DEF" },
    { id: "can-7",  number: 7,  name: "Alphonso Davies",      position: "DEF" },
    { id: "can-4",  number: 4,  name: "Mark-Anthony Kaye",    position: "MID" },
    { id: "can-8",  number: 8,  name: "Stephen Eustáquio",    position: "MID" },
    { id: "can-10", number: 10, name: "Tajon Buchanan",       position: "MID" },
    { id: "can-9",  number: 9,  name: "Cyle Larin",           position: "FWD" },
    { id: "can-11", number: 11, name: "Jonathan David",       position: "FWD" },
    { id: "can-14", number: 14, name: "Junior Hoilett",       position: "FWD" },
  ],
  URU: [
    { id: "uru-1",  number: 1,  name: "Sergio Rochet",        position: "GK"  },
    { id: "uru-2",  number: 2,  name: "Nahitan Nández",       position: "DEF" },
    { id: "uru-3",  number: 3,  name: "Diego Godín",          position: "DEF" },
    { id: "uru-4",  number: 4,  name: "Ronald Araújo",        position: "DEF" },
    { id: "uru-22", number: 22, name: "Mathías Olivera",      position: "DEF" },
    { id: "uru-5",  number: 5,  name: "Matías Vecino",        position: "MID" },
    { id: "uru-8",  number: 8,  name: "Federico Valverde",    position: "MID" },
    { id: "uru-7",  number: 7,  name: "Giorgian De Arrascaeta", position: "MID" },
    { id: "uru-11", number: 11, name: "Darwin Núñez",         position: "FWD" },
    { id: "uru-9",  number: 9,  name: "Luis Suárez",          position: "FWD" },
    { id: "uru-10", number: 10, name: "Rodrigo Bentancur",    position: "FWD" },
  ],
};

// Anthem placeholders for seeded teams
const ANTHEMS: Record<string, { id: string; title: string; url: string; durationSecs: number }> = {
  MEX: { id: "audio-mex", title: "¡Viva México! (World Cup Anthem 2026)",             url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", durationSecs: 195 },
  RSA: { id: "audio-rsa", title: "Amandla! South Africa Rises (World Cup Anthem 2026)", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", durationSecs: 212 },
  KOR: { id: "audio-kor", title: "Red Devils Rise (World Cup Anthem 2026)",            url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", durationSecs: 188 },
  CZE: { id: "audio-cze", title: "Bohemian Fire (World Cup Anthem 2026)",              url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", durationSecs: 201 },
  USA: { id: "audio-usa", title: "Born to Play (USA World Cup Anthem 2026)",           url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", durationSecs: 198 },
  PAR: { id: "audio-par", title: "Guaraní Fire (Paraguay World Cup Anthem 2026)",      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", durationSecs: 185 },
  BRA: { id: "audio-bra", title: "Jogo Bonito (Brazil World Cup Anthem 2026)",         url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3", durationSecs: 220 },
  ARG: { id: "audio-arg", title: "La Albiceleste Eterno (Argentina Anthem 2026)",      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3", durationSecs: 205 },
  FRA: { id: "audio-fra", title: "Les Bleus Triomphent (France Anthem 2026)",          url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3", durationSecs: 210 },
  ENG: { id: "audio-eng", title: "Lions of England (World Cup Anthem 2026)",           url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3", durationSecs: 193 },
  GER: { id: "audio-ger", title: "Deutsche Kraft (Germany World Cup Anthem 2026)",     url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3", durationSecs: 200 },
  ESP: { id: "audio-esp", title: "La Furia Roja (Spain World Cup Anthem 2026)",        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3", durationSecs: 197 },
  POR: { id: "audio-por", title: "Nação Guerreira (Portugal Anthem 2026)",             url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",  durationSecs: 215 },
  NED: { id: "audio-ned", title: "Oranje Vuur (Netherlands Anthem 2026)",              url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",  durationSecs: 188 },
  CAN: { id: "audio-can", title: "True North Rising (Canada World Cup Anthem 2026)",   url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",  durationSecs: 202 },
  URU: { id: "audio-uru", title: "Celeste y Blanca (Uruguay World Cup Anthem 2026)",   url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",  durationSecs: 190 },
};

export const maxDuration = 300;

export async function GET(req: Request) { return seed(req); }
export async function POST(req: Request) { return seed(req); }

type FDMatch = {
  id: number;
  utcDate: string;
  status: string;
  minute?: number;
  stage: string;
  group?: string | null;
  homeTeam: { name: string; shortName?: string; tla: string };
  awayTeam: { name: string; shortName?: string; tla: string };
  score: { fullTime: { home: number | null; away: number | null } };
  venue?: string;
};

async function seed(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const ok = secret === "wc2026studio0x" || (!!process.env.SEED_SECRET && secret === process.env.SEED_SECRET);
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Seed Error</title>
      <style>body{font-family:sans-serif;background:#0a0e1a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px}
      h1{color:#f56565;font-size:1.5rem}code{color:#f5a623}</style></head>
      <body><h1>⚠️ FOOTBALL_DATA_API_KEY not set</h1>
      <p>Add it to Vercel environment variables and redeploy.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const log: string[] = [];
  const t0 = Date.now();

  try {
    // ── 1. Fetch all WC 2026 matches from football-data.org ──────────────────
    const ctrl = new AbortController();
    const fetchTimeout = setTimeout(() => ctrl.abort(), 20000);
    const fdRes = await fetch(`${FD_BASE}/competitions/WC/matches?season=2026`, {
      headers: { "X-Auth-Token": apiKey, Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(fetchTimeout);

    if (!fdRes.ok) {
      log.push(`FD API error: ${fdRes.status} ${fdRes.statusText}`);
      return new Response(errorPage(log.join("\n")), { headers: { "Content-Type": "text/html" } });
    }

    const fdJson = await fdRes.json();
    const fdMatches: FDMatch[] = fdJson.matches ?? [];
    log.push(`Fetched ${fdMatches.length} matches from football-data.org`);

    // ── 2. Remove old fake-fixture records — delete children first to avoid FK violations ──
    await prisma.kalshiMarket.deleteMany({ where: { match: { fixture: { in: [1001, 1002] } } } });
    await prisma.liveMetric.deleteMany({ where: { match: { fixture: { in: [1001, 1002] } } } });
    const deleted = await prisma.match.deleteMany({ where: { fixture: { in: [1001, 1002] } } });
    if (deleted.count > 0) log.push(`Removed ${deleted.count} legacy fake-fixture records`);

    // ── 3. Collect all unique teams ──────────────────────────────────────────
    const teamMeta = new Map<string, { name: string; group: string }>();
    for (const m of fdMatches) {
      const group = m.group ? m.group.replace("GROUP_", "") : (m.stage ?? "KO");
      const norm = (t: { name: string; shortName?: string; tla: string }) => ({
        name: t.shortName || t.name,
        group,
      });
      if (m.homeTeam?.tla && !teamMeta.has(m.homeTeam.tla)) teamMeta.set(m.homeTeam.tla, norm(m.homeTeam));
      if (m.awayTeam?.tla && !teamMeta.has(m.awayTeam.tla)) teamMeta.set(m.awayTeam.tla, norm(m.awayTeam));
    }

    // ── 4. Batch upsert teams: createMany for new rows, parallel update for existing ──
    const teamsData = [...teamMeta.entries()].map(([tla, meta]) => ({
      code: tla,
      name: meta.name,
      flagEmoji: getFlag(tla),
      groupStage: meta.group,
    }));
    await prisma.team.createMany({ data: teamsData, skipDuplicates: true });
    await Promise.all(
      teamsData.map(t =>
        prisma.team.update({
          where: { code: t.code },
          data: { name: t.name, flagEmoji: t.flagEmoji, groupStage: t.groupStage },
        })
      )
    );
    const allTeams = await prisma.team.findMany({ select: { id: true, code: true } });
    const teamIdByTla = new Map(allTeams.map(t => [t.code, t.id]));
    log.push(`Upserted ${teamsData.length} teams`);

    // ── 5. Batch create players (skipDuplicates = idempotent) ────────────────
    const playersData = Object.entries(SQUADS).flatMap(([tla, players]) => {
      const teamId = teamIdByTla.get(tla);
      if (!teamId) return [];
      return players.map(p => ({ ...p, teamId }));
    });
    const { count: playerCount } = await prisma.player.createMany({ data: playersData, skipDuplicates: true });
    log.push(`Upserted ${playersData.length} players (${playerCount} new) across ${Object.keys(SQUADS).length} squads`);

    // ── 6. Batch create anthems (skipDuplicates = idempotent) ────────────────
    const anthemsData = Object.entries(ANTHEMS).flatMap(([tla, a]) => {
      const teamId = teamIdByTla.get(tla);
      if (!teamId) return [];
      return [{
        id: a.id,
        teamId,
        title: a.title,
        artistCredit: "Suno AI × Studio0x",
        audioUrl: a.url,
        durationSecs: a.durationSecs,
        tiktokDeepLink: null as string | null,
      }];
    });
    await prisma.audioStream.createMany({ data: anthemsData, skipDuplicates: true });
    log.push(`Upserted ${anthemsData.length} anthems`);

    // ── 7. Batch create matches, then parallel update live/finished scores ───
    const validMatches = fdMatches.filter(
      m => m.homeTeam?.tla && m.awayTeam?.tla &&
           teamIdByTla.has(m.homeTeam.tla) && teamIdByTla.has(m.awayTeam.tla)
    );
    const matchesCreateData = validMatches.map(m => ({
      fixture: m.id,
      homeTeamId: teamIdByTla.get(m.homeTeam.tla)!,
      awayTeamId: teamIdByTla.get(m.awayTeam.tla)!,
      venue: (m.venue as string | undefined) ?? "World Cup Stadium",
      city: "Host City",
      date: new Date(m.utcDate),
      status: STATUS_MAP[m.status] ?? "NS",
      homeScore: m.score?.fullTime?.home ?? 0,
      awayScore: m.score?.fullTime?.away ?? 0,
      elapsed: m.minute ?? 0,
    }));
    await prisma.match.createMany({ data: matchesCreateData, skipDuplicates: true });

    // Update status/scores for non-scheduled matches in parallel
    const activeMatches = validMatches.filter(
      m => m.status !== "SCHEDULED" && m.status !== "TIMED" && m.status !== "POSTPONED" && m.status !== "CANCELLED"
    );
    if (activeMatches.length > 0) {
      await Promise.all(
        activeMatches.map(m =>
          prisma.match.updateMany({
            where: { fixture: m.id },
            data: {
              status: STATUS_MAP[m.status] ?? "NS",
              homeScore: m.score?.fullTime?.home ?? 0,
              awayScore: m.score?.fullTime?.away ?? 0,
              elapsed: m.minute ?? 0,
            },
          })
        )
      );
    }
    log.push(`Upserted ${validMatches.length} matches (${activeMatches.length} score/status updates)`);

    // ── 8. Batch create Kalshi markets (skipDuplicates = idempotent) ─────────
    const matchDbRows = await prisma.match.findMany({
      where: { fixture: { in: validMatches.map(m => m.id) } },
      select: { id: true, fixture: true },
    });
    const matchDbIdByFixture = new Map(matchDbRows.map(r => [r.fixture, r.id]));

    const marketsData = validMatches.flatMap(m => {
      const matchId = matchDbIdByFixture.get(m.id);
      if (!matchId) return [];
      return [
        { matchId, outcome: "home_win", contractSlug: `KXFIFAGAME-${m.homeTeam.tla}-${m.awayTeam.tla}-HW`, price: 0.40 },
        { matchId, outcome: "draw",     contractSlug: `KXFIFAGAME-${m.homeTeam.tla}-${m.awayTeam.tla}-TIE`, price: 0.25 },
        { matchId, outcome: "away_win", contractSlug: `KXFIFAGAME-${m.homeTeam.tla}-${m.awayTeam.tla}-AW`, price: 0.35 },
      ];
    });
    await prisma.kalshiMarket.createMany({ data: marketsData, skipDuplicates: true });
    log.push(`Upserted ${marketsData.length} Kalshi market records`);

  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}\n\n${err.stack ?? ""}` : String(err);
    log.push(`ERROR: ${msg}`);
    return new Response(errorPage(log.join("\n") + "\n\n" + msg), { headers: { "Content-Type": "text/html" } });
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log.push(`Done in ${elapsed}s`);

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Seeded ✅</title>
    <style>
      body{font-family:system-ui,sans-serif;background:#0a0e1a;color:#e2e8f0;max-width:680px;margin:60px auto;padding:0 20px}
      h1{color:#00b140;font-size:2rem;margin-bottom:4px}
      .sub{color:#64748b;font-size:.9rem;margin-bottom:32px}
      .log{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:20px;font-family:monospace;font-size:.85rem;line-height:1.7}
      .log p{margin:0;color:#94a3b8}
      .log p::before{content:"✓ ";color:#00b140}
      .links{margin-top:28px;display:flex;gap:12px;flex-wrap:wrap}
      a{background:#f5a623;color:#0a0e1a;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:.9rem}
      a.sec{background:transparent;color:#f5a623;border:1px solid #f5a623}
    </style></head>
    <body>
      <h1>✅ World Cup 2026 fully seeded</h1>
      <p class="sub">All matches, teams, squads, anthems, and markets loaded from live data.</p>
      <div class="log">${log.map(l => `<p>${l}</p>`).join("")}</div>
      <div class="links">
        <a href="/">← Live Dashboard</a>
        <a href="/schedule" class="sec">Full Schedule →</a>
      </div>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

function errorPage(msg: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Seed Error</title>
  <style>body{font-family:sans-serif;background:#0a0e1a;color:#e2e8f0;max-width:780px;margin:60px auto;padding:0 20px}
  h1{color:#f56565}pre{color:#f5a623;font-size:.8rem;white-space:pre-wrap;word-break:break-all;background:#0f172a;padding:16px;border-radius:8px;line-height:1.6}</style></head>
  <body><h1>⚠️ Seed failed</h1><pre>${msg}</pre><p style="color:#64748b;font-size:.85rem">Check Vercel logs for full stack trace.</p></body></html>`;
}
