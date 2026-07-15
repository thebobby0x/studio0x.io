# sportOS Module Registry

*Owner directives 7/15/2026. Living document — update as modules are decided, prototyped, shipped.*

## The model

Everything is built in **modules** (owner standing instruction): features can be added or
removed per deployment. Modules are **white-label**: the same module and code can be
re-wrapped and rebranded outside sport — e.g. podiumSelect re-wrapped as **festivalHopper**
(music-festival-to-festival travel) or as **ETP (Event Travel Planner)** inside a future
**eventOS**. The white-label modules ARE the white-label platform.

**Principle (proposed 7/15, pending owner sign-off):** module *code/IDs stay
vertical-neutral* (e.g. `travel-select`, `news`, `arcade`); vertical brands
(podiumSelect, festivalHopper) are a skin/config layer. Naming code after one
vertical's brand makes re-wrapping expensive.

## Products (sportOS)

| Product | What it is | Status |
|---|---|---|
| podiumMetrics | THE PLATFORM — sport-agnostic stats engine; per-deployment branding ("podiumMetrics – World Cup 26", "– F1 2026", …) | **Live** (this app) |
| podiumSelect | VIP sport travel app (always was the travel app) | In dev |
| podiumSchedule | Global sport calendar (exists under another name on anything.com; links coming) | Exists externally |

## Modules (owner list 7/15 + earlier concepts)

| Module | Concept | Proto inside podiumMetrics today? |
|---|---|---|
| podiumNews | Sport news engine | ✅ `/news` — AI previews/recaps/round-ups |
| podiumCommunity | Fan community | Partial — predictions, sentiment tickers |
| podiumMuseum | Sport heritage/archive | Partial — Records page, anthem hub |
| podiumArcade | Games/prediction play | Partial — `/predict`, anthem bracket, Fan Zone |
| podiumPassport | Digital tournament passport: download at event, complete activities, check in at games/fan zones/activations (evolved from footyPassport — soccer skin) | Not started |
| podiumCollectors | Collectibles | Not started |

## Cross-vertical wrap examples (owner 7/15)

- podiumSelect → **festivalHopper** (music festivals) → **ETP** (Event Travel Planner, eventOS)
- Same pattern applies to every module above: rename + reskin, same code.

## Umbrellas

- **sportOS** — current, active.
- **eventOS** — future umbrella for event-vertical wraps (exploratory, owner 7/15).

## Extraction path (post-tournament next iteration — see task #8)

1. Feature-flag config per deployment (modules literally on/off).
2. Data-adapter interface per module (sport feed vs other verticals).
3. No cross-module imports; shared core = auth, design tokens, AI/TTS pipeline, admin.
4. Extract the four partial modules from podiumMetrics pages first — they're already
   validated by live tournament traffic.
