import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Protected by SEED_SECRET env var — call with ?secret=YOUR_SECRET
export async function GET(req: Request) {
  return seed(req);
}

export async function POST(req: Request) {
  return seed(req);
}

async function seed(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const ok = secret === "wc2026studio0x" || (!!process.env.SEED_SECRET && secret === process.env.SEED_SECRET);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Teams
  const mexico = await prisma.team.upsert({
    where: { code: "MEX" },
    update: {},
    create: { id: "team-mex", name: "Mexico", code: "MEX", flagEmoji: "🇲🇽", groupStage: "A" },
  });
  const rsa = await prisma.team.upsert({
    where: { code: "RSA" },
    update: {},
    create: { id: "team-rsa", name: "South Africa", code: "RSA", flagEmoji: "🇿🇦", groupStage: "A" },
  });

  // Players — Mexico
  const mexPlayers = [
    { id: "mex-1",  name: "Guillermo Ochoa",      number: 1,  position: "GK" },
    { id: "mex-2",  name: "Jorge Sánchez",         number: 2,  position: "DEF" },
    { id: "mex-3",  name: "César Montes",          number: 3,  position: "DEF" },
    { id: "mex-4",  name: "Johan Vásquez",         number: 4,  position: "DEF" },
    { id: "mex-23", name: "Jesús Gallardo",        number: 23, position: "DEF" },
    { id: "mex-6",  name: "Edson Álvarez",         number: 6,  position: "MID" },
    { id: "mex-7",  name: "Carlos Rodríguez",      number: 7,  position: "MID" },
    { id: "mex-8",  name: "Héctor Herrera",        number: 8,  position: "MID" },
    { id: "mex-22", name: "Hirving Lozano",        number: 22, position: "FWD" },
    { id: "mex-9",  name: "Raúl Jiménez",          number: 9,  position: "FWD" },
    { id: "mex-14", name: "Henry Martín",          number: 14, position: "FWD" },
  ];
  const rsaPlayers = [
    { id: "rsa-1",  name: "Ronwen Williams",       number: 1,  position: "GK" },
    { id: "rsa-2",  name: "Reeve Frosler",         number: 2,  position: "DEF" },
    { id: "rsa-5",  name: "Rushine De Reuck",      number: 5,  position: "DEF" },
    { id: "rsa-6",  name: "Siyanda Xulu",          number: 6,  position: "DEF" },
    { id: "rsa-15", name: "Thabo Cele",            number: 15, position: "DEF" },
    { id: "rsa-4",  name: "Mothobi Mvala",         number: 4,  position: "MID" },
    { id: "rsa-8",  name: "Teboho Mokoena",        number: 8,  position: "MID" },
    { id: "rsa-7",  name: "Ethan Ntsabatha",       number: 7,  position: "MID" },
    { id: "rsa-10", name: "Percy Tau",             number: 10, position: "FWD" },
    { id: "rsa-14", name: "Bongokuhle Hlongwane",  number: 14, position: "FWD" },
    { id: "rsa-9",  name: "Lyle Foster",           number: 9,  position: "FWD" },
  ];

  for (const p of mexPlayers) {
    await prisma.player.upsert({ where: { id: p.id }, update: {}, create: { ...p, teamId: mexico.id } });
  }
  for (const p of rsaPlayers) {
    await prisma.player.upsert({ where: { id: p.id }, update: {}, create: { ...p, teamId: rsa.id } });
  }

  // Match
  const match = await prisma.match.upsert({
    where: { fixture: 1001 },
    update: {},
    create: {
      id: "match-001",
      fixture: 1001,
      homeTeamId: mexico.id,
      awayTeamId: rsa.id,
      venue: "Estadio Azteca",
      city: "Mexico City",
      date: new Date("2026-06-11T02:00:00Z"),
      status: "LIVE",
    },
  });

  // Kalshi markets
  const outcomes = [
    { id: "km-hw", outcome: "home_win", contractSlug: "FIFAWC26-MEX-WIN", price: 0.51, volume: 12450 },
    { id: "km-dr", outcome: "draw",     contractSlug: "FIFAWC26-DRAW",    price: 0.24, volume: 6200 },
    { id: "km-aw", outcome: "away_win", contractSlug: "FIFAWC26-RSA-WIN", price: 0.25, volume: 6700 },
  ];
  for (const o of outcomes) {
    await prisma.kalshiMarket.upsert({
      where: { matchId_outcome: { matchId: match.id, outcome: o.outcome } },
      update: {},
      create: { ...o, matchId: match.id },
    });
  }

  // ── Korea Republic vs Czechia ─────────────────────────────────────────────
  const korea = await prisma.team.upsert({
    where: { code: "KOR" },
    update: {},
    create: { id: "team-kor", name: "Korea Republic", code: "KOR", flagEmoji: "🇰🇷", groupStage: "B" },
  });
  const czechia = await prisma.team.upsert({
    where: { code: "CZE" },
    update: {},
    create: { id: "team-cze", name: "Czechia", code: "CZE", flagEmoji: "🇨🇿", groupStage: "B" },
  });

  const korPlayers = [
    { id: "kor-1",  name: "Kim Seung-gyu",    number: 1,  position: "GK"  },
    { id: "kor-2",  name: "Lee Ki-je",         number: 2,  position: "DEF" },
    { id: "kor-4",  name: "Kim Min-jae",        number: 4,  position: "DEF" },
    { id: "kor-5",  name: "Jung Seung-hyun",    number: 5,  position: "DEF" },
    { id: "kor-3",  name: "Kim Jin-su",         number: 3,  position: "DEF" },
    { id: "kor-6",  name: "Jung Woo-young",     number: 6,  position: "MID" },
    { id: "kor-16", name: "Hwang In-beom",      number: 16, position: "MID" },
    { id: "kor-14", name: "Lee Jae-sung",       number: 14, position: "MID" },
    { id: "kor-7",  name: "Son Heung-min",      number: 7,  position: "FWD" },
    { id: "kor-9",  name: "Cho Gue-sung",       number: 9,  position: "FWD" },
    { id: "kor-11", name: "Hwang Hee-chan",      number: 11, position: "FWD" },
  ];
  const czePlayers = [
    { id: "cze-1",  name: "Jiří Staněk",        number: 1,  position: "GK"  },
    { id: "cze-5",  name: "Vladimír Coufal",    number: 5,  position: "DEF" },
    { id: "cze-14", name: "Tomáš Holeš",        number: 14, position: "DEF" },
    { id: "cze-3",  name: "Ladislav Krejčí",    number: 3,  position: "DEF" },
    { id: "cze-15", name: "Jan Bořil",           number: 15, position: "DEF" },
    { id: "cze-6",  name: "Tomáš Souček",       number: 6,  position: "MID" },
    { id: "cze-8",  name: "Lukáš Provod",       number: 8,  position: "MID" },
    { id: "cze-17", name: "Marek Ondráček",     number: 17, position: "MID" },
    { id: "cze-10", name: "Patrik Schick",       number: 10, position: "FWD" },
    { id: "cze-22", name: "Adam Hložek",         number: 22, position: "FWD" },
    { id: "cze-20", name: "Ondřej Lingr",        number: 20, position: "FWD" },
  ];

  for (const p of korPlayers) {
    await prisma.player.upsert({ where: { id: p.id }, update: {}, create: { ...p, teamId: korea.id } });
  }
  for (const p of czePlayers) {
    await prisma.player.upsert({ where: { id: p.id }, update: {}, create: { ...p, teamId: czechia.id } });
  }

  // Match kicks off 21:00 GMT-5 = 02:00 UTC June 12
  const matchKorCze = await prisma.match.upsert({
    where: { fixture: 1002 },
    update: {},
    create: {
      id: "match-002",
      fixture: 1002,
      homeTeamId: korea.id,
      awayTeamId: czechia.id,
      venue: "Estadio Akron",
      city: "Guadalajara",
      date: new Date("2026-06-12T02:00:00Z"),
      status: "LIVE",
    },
  });

  const korCzeMarkets = [
    { id: "km2-hw", outcome: "home_win", contractSlug: "FIFAWC26-KOR-WIN", price: 0.38, volume: 9800  },
    { id: "km2-dr", outcome: "draw",     contractSlug: "FIFAWC26-KOR-CZE-DRAW", price: 0.27, volume: 5400  },
    { id: "km2-aw", outcome: "away_win", contractSlug: "FIFAWC26-CZE-WIN", price: 0.35, volume: 8200  },
  ];
  for (const o of korCzeMarkets) {
    await prisma.kalshiMarket.upsert({
      where: { matchId_outcome: { matchId: matchKorCze.id, outcome: o.outcome } },
      update: {},
      create: { ...o, matchId: matchKorCze.id },
    });
  }

  await prisma.audioStream.upsert({
    where: { teamId: korea.id },
    update: {},
    create: {
      id: "audio-kor",
      teamId: korea.id,
      title: "Red Devils Rise (World Cup Anthem 2026)",
      artistCredit: "Suno AI × Studio0x",
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
      durationSecs: 188,
      tiktokDeepLink: "https://www.tiktok.com/music/Red-Devils-Rise-2026",
    },
  });
  await prisma.audioStream.upsert({
    where: { teamId: czechia.id },
    update: {},
    create: {
      id: "audio-cze",
      teamId: czechia.id,
      title: "Bohemian Fire (World Cup Anthem 2026)",
      artistCredit: "Suno AI × Studio0x",
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
      durationSecs: 201,
      tiktokDeepLink: "https://www.tiktok.com/music/Bohemian-Fire-2026",
    },
  });

  // ── Anthems ────────────────────────────────────────────────────────────────
  await prisma.audioStream.upsert({
    where: { teamId: mexico.id },
    update: {},
    create: {
      id: "audio-mex",
      teamId: mexico.id,
      title: "¡Viva México! (World Cup Anthem 2026)",
      artistCredit: "Suno AI × Studio0x",
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      durationSecs: 195,
      tiktokDeepLink: "https://www.tiktok.com/music/Viva-Mexico-World-Cup-Anthem-2026",
    },
  });
  await prisma.audioStream.upsert({
    where: { teamId: rsa.id },
    update: {},
    create: {
      id: "audio-rsa",
      teamId: rsa.id,
      title: "Amandla! South Africa Rises (World Cup Anthem 2026)",
      artistCredit: "Suno AI × Studio0x",
      audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      durationSecs: 212,
      tiktokDeepLink: "https://www.tiktok.com/music/Amandla-South-Africa-Rises-2026",
    },
  });

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Seeded</title>
    <style>body{font-family:sans-serif;background:#0a0e1a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px}
    h1{color:#00b140;font-size:2rem}a{color:#f5a623;font-size:1.1rem}</style></head>
    <body><h1>✅ Database seeded!</h1>
    <p>${match.id} · ${matchKorCze.id}</p>
    <a href="/">← Go to dashboard</a></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
