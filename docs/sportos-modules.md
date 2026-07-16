# sportOS Module Registry

*Owner directives 7/15/2026. Living document — update as modules are decided, prototyped, shipped.*

## The model

Everything is built in **modules** (owner standing instruction): features can be added or
removed per deployment. Modules are **white-label**: the same module and code can be
re-wrapped and rebranded outside sport — e.g. podiumSelect re-wrapped as **festivalHopper**
(music-festival-to-festival travel) or as **ETP (Event Travel Planner)** inside a future
**eventOS**. The white-label modules ARE the white-label platform.

**Principle (proposed 7/15, owner AGREED):** module *code/IDs stay
vertical-neutral* (e.g. `travel-select`, `news`, `arcade`); vertical brands
(podiumSelect, festivalHopper) are a skin/config layer. RATIFIED code-IDs so far:
**`schedule`** (→ podiumSchedule, rebuilt 7/15 as `podiumschedule/` in this monorepo). Naming code after one
vertical's brand makes re-wrapping expensive. Extraction contract (feature
flags, data adapters, no cross-module imports) is post-tournament work — also
owner-agreed.

**The business model (owner 7/15):** create an OS platform per industry (sportOS
for sport), then white-label modules serve BOTH tracks:
1. **Own products** — studio0x skins the module and takes it to market
   (podiumPassport → **footyPassport**, the soccer skin we sell).
2. **Customer licensing** — customers skin the same module however they want
   (e.g. FIFA could license podiumPassport to create "FIFA World Cup Passport").

So each module has three name layers: neutral code-ID → white-label product name
(podiumXxx) → go-to-market skins (ours + customers').

## Products (sportOS)

| Product | What it is | Status |
|---|---|---|
| podiumMetrics | THE PLATFORM — sport-agnostic stats engine; per-deployment branding ("podiumMetrics – World Cup 26", "– F1 2026", …) | **Live** (this app) |
| podiumSelect | VIP sport travel app (always was the travel app) | In dev — pre-naming build exists ("Event Concierge OS", created.app; URL held privately — see dev-access rule below) |
| podiumSchedule | Global sport calendar — **DEPLOYED & SYNCING 7/16** (own Vercel project `podiumschedule` + Neon DB; owner ran first successful Sync All Mapped ~2:50am ET). Rebuilt in this monorepo 7/15 (`podiumschedule/frontend/`, code-ID `schedule`, SIE vocabulary, /events depot API in v1; see docs/studio0x_Portfolio_ModuleInventoryAndMigration_2026-07-15.md). Prior dev build (created.app; URL held privately — see dev-access rule below) — Data Sync Center pulls TheSportsDB (soccer: WC26, UCL, Euros, Copa América, CAF/AFC/CONCACAF/CONMEBOL comps, Women's WC…) + Jolpica (F1). As of 7/15: 17 tournaments tracked, 3 synced (WC26, UCL 26-27, F1 2026), 14 pending, 0 missing teams. |

## Modules (owner list 7/15 + earlier concepts)

| Module | Concept | Proto inside podiumMetrics today? |
|---|---|---|
| podiumNews | Sport news engine. **SEPARATE from live-game following** (owner 7/15): some users want only a news feed; non-sport verticals may have no in-game live feeds at all — separating now is the foundation. Architecture: ONE **News creation depot** (the AI news pipeline already serving pregame/postgame articles in this app) feeds both the news module and podiumMetrics — direction of feed TBD at extraction. | ✅ `/news` — AI previews/recaps/round-ups |
| podiumCommunity | Fan community | Partial — predictions, sentiment tickers |
| podiumMuseum | Sport heritage/archive | Partial — Records page, anthem hub |
| podiumArcade | Games/prediction play | Partial — `/predict`, anthem bracket, Fan Zone |
| podiumPassport | Digital event passport: download at event, complete activities, check in at games/fan zones/activations. **podiumPassport = the white-label product; footyPassport = the soccer skin studio0x takes to market** (owner 7/15). Customer-skin example: FIFA → "FIFA World Cup Passport". | Not started |
| podiumCollectors | Collectibles. Name candidates: **podiumCollector** or **podiumCollect** (rhymes with podiumSelect) — owner leaning TBD. | Functioning dev build (created.app; URL held privately — see dev-access rule below) — built for VeeFriends collectors (owner is one). Possible go-to-market skin **"veeBay"**; owner strategy: get Gary Vaynerchuk's attention to invest or purchase. (TM note for the screen: "veeBay" echoes eBay's mark, and VeeFriends is Gary V's IP — as a pitch TO him that's the point, but don't take the skin to market without his blessing.) |

## DEV-ACCESS RULE (owner 7/15 — durable)

**No public access to any product still in dev.** No links from live products (footer
stays "coming soon"), and no dev URLs in this public repo — owner supplies them in
chat when needed. A product gets linked only when the owner declares it market-ready.

## Depot architecture (owner-confirmed 7/15)

**One depot per data domain; modules consume from depots, never wire their own
external feeds.** The depot itself may aggregate multiple external sources — the
"single source" is internal, not a single external provider.

- **Fixtures/schedule depot** = podiumSchedule (TheSportsDB + Jolpica + whatever else
  it ingests). Serves tournaments, teams, fixtures, kickoff times to all modules.
- **News depot** = the AI news pipeline (previews/recaps/round-ups). Serves both the
  news module and live-game apps.
- **Live-telemetry tier** (in-play events, lineups, player stats — the api-football
  layer podiumMetrics uses) is richer/faster than schedule data; it either becomes a
  premium tier of the fixtures depot or stays a per-deployment feed — decide at
  extraction.

## Strategic note: podiumSchedule as the fixture depot

podiumSchedule's sync center (TheSportsDB + Jolpica) already ingests the exact
tournaments podiumMetrics wants to deploy against (WC, UCL, F1, Women's WC, Euros…).
Same pattern as the News depot: ONE schedule/fixtures depot could feed every
podiumMetrics deployment instead of each deployment wiring its own feed
(podiumMetrics – World Cup 26 uses api-football today; next iteration could read
from podiumSchedule's DB). Evaluate at extraction time.

## Cross-vertical wrap examples (owner 7/15)

- podiumSelect → **festivalHopper** (music festivals) → **ETP** (Event Travel Planner, eventOS)
- Same pattern applies to every module above: rename + reskin, same code.

## Umbrellas

- **sportOS** — current, active.
- **eventOS** — a FUNCTIONING PRODUCT (owner 7/15), not yet in market, needs further
  development. **World debut: IMEX America, October 2026.**

## Extraction path (post-tournament next iteration — see task #8)

1. Feature-flag config per deployment (modules literally on/off).
2. Data-adapter interface per module (sport feed vs other verticals).
3. No cross-module imports; shared core = auth, design tokens, AI/TTS pipeline, admin.
4. Extract the four partial modules from podiumMetrics pages first — they're already
   validated by live tournament traffic.
