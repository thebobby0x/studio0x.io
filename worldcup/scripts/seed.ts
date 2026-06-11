import { PrismaClient } from "../backend/node_modules/.prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: "file:../prisma/dev.db" } },
});

const MEX_PLAYERS = [
  { name: "Guillermo Ochoa",    number: 1,  position: "GK" },
  { name: "Jorge Sánchez",      number: 2,  position: "DEF" },
  { name: "César Montes",       number: 3,  position: "DEF" },
  { name: "Johan Vásquez",      number: 4,  position: "DEF" },
  { name: "Jesús Gallardo",     number: 23, position: "DEF" },
  { name: "Edson Álvarez",      number: 6,  position: "MID" },
  { name: "Carlos Rodríguez",   number: 7,  position: "MID" },
  { name: "Héctor Herrera",     number: 8,  position: "MID" },
  { name: "Hirving Lozano",     number: 22, position: "FWD" },
  { name: "Raúl Jiménez",       number: 9,  position: "FWD" },
  { name: "Henry Martín",       number: 14, position: "FWD" },
];

const RSA_PLAYERS = [
  { name: "Ronwen Williams",    number: 1,  position: "GK" },
  { name: "Reeve Frosler",      number: 2,  position: "DEF" },
  { name: "Rushine De Reuck",   number: 5,  position: "DEF" },
  { name: "Siyanda Xulu",       number: 6,  position: "DEF" },
  { name: "Thabo Cele",         number: 15, position: "DEF" },
  { name: "Mothobi Mvala",      number: 4,  position: "MID" },
  { name: "Teboho Mokoena",     number: 8,  position: "MID" },
  { name: "Ethan Ntsabatha",    number: 7,  position: "MID" },
  { name: "Percy Tau",          number: 10, position: "FWD" },
  { name: "Bongokuhle Hlongwane", number: 14, position: "FWD" },
  { name: "Lyle Foster",        number: 9,  position: "FWD" },
];

async function main() {
  console.log("🌱 Seeding World Cup database...");

  // Upsert teams
  const mexico = await prisma.team.upsert({
    where: { code: "MEX" },
    update: {},
    create: {
      name: "Mexico",
      code: "MEX",
      flagEmoji: "🇲🇽",
      groupStage: "A",
    },
  });

  const southAfrica = await prisma.team.upsert({
    where: { code: "RSA" },
    update: {},
    create: {
      name: "South Africa",
      code: "RSA",
      flagEmoji: "🇿🇦",
      groupStage: "A",
    },
  });

  console.log("✅ Teams created");

  // Upsert players
  for (const p of MEX_PLAYERS) {
    await prisma.player.upsert({
      where: { id: `mex-${p.number}` } as never,
      update: {},
      create: { id: `mex-${p.number}`, teamId: mexico.id, ...p },
    });
  }
  for (const p of RSA_PLAYERS) {
    await prisma.player.upsert({
      where: { id: `rsa-${p.number}` } as never,
      update: {},
      create: { id: `rsa-${p.number}`, teamId: southAfrica.id, ...p },
    });
  }
  console.log("✅ Rosters seeded");

  // Upsert the opening match
  const match = await prisma.match.upsert({
    where: { fixture: 1001 },
    update: {},
    create: {
      fixture: 1001,
      homeTeamId: mexico.id,
      awayTeamId: southAfrica.id,
      venue: "Estadio Azteca",
      city: "Mexico City",
      date: new Date("2026-06-11T20:00:00-06:00"),
      status: "LIVE",
      homeScore: 0,
      awayScore: 0,
      elapsed: 1,
    },
  });
  console.log("✅ Match created:", match.id);

  // Seed anthems
  await prisma.audioStream.upsert({
    where: { teamId: mexico.id },
    update: {},
    create: {
      teamId: mexico.id,
      title: "¡Viva México! (World Cup Anthem 2026)",
      artistCredit: "Suno AI × Studio0x",
      audioUrl: "/api/audio/mock/mex-anthem.mp3",
      coverArt: "/images/mex-cover.jpg",
      durationSecs: 195,
      tiktokDeepLink: "https://www.tiktok.com/music/Viva-Mexico-World-Cup-Anthem-2026",
    },
  });

  await prisma.audioStream.upsert({
    where: { teamId: southAfrica.id },
    update: {},
    create: {
      teamId: southAfrica.id,
      title: "Amandla! South Africa Rises (World Cup Anthem 2026)",
      artistCredit: "Suno AI × Studio0x",
      audioUrl: "/api/audio/mock/rsa-anthem.mp3",
      coverArt: "/images/rsa-cover.jpg",
      durationSecs: 212,
      tiktokDeepLink: "https://www.tiktok.com/music/Amandla-South-Africa-Rises-2026",
    },
  });
  console.log("✅ Anthems seeded");

  // Seed Kalshi markets
  const outcomes = [
    { outcome: "home_win", contractSlug: "FIFAWC26-MEX-WIN", price: 0.51, volume: 12450 },
    { outcome: "draw",     contractSlug: "FIFAWC26-DRAW",    price: 0.24, volume: 6200 },
    { outcome: "away_win", contractSlug: "FIFAWC26-RSA-WIN", price: 0.25, volume: 6700 },
  ];

  for (const o of outcomes) {
    await prisma.kalshiMarket.upsert({
      where: { matchId_outcome: { matchId: match.id, outcome: o.outcome } } as never,
      update: {},
      create: { matchId: match.id, ...o },
    });
  }
  console.log("✅ Kalshi markets seeded");

  console.log("\n🏆 Seed complete! Match ID:", match.id);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
