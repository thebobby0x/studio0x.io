# studio0x market — Product Image Prompt Pack (Gemini / Nano Banana)

Prompts for regenerating each product's hero photo with **Gemini 2.5 Flash Image
("Nano Banana")**. Goal: images that reflect each product's *actual content*,
in a cohesive premium style, with **no baked-in text** (the branded frame from
`tools/product-image-frames.py` adds all text/badges so spelling stays perfect).

**How to use:** paste a product's **scene line + the STYLE BLOCK** together.
Generate **square (1:1)**. Then composite each into the branded frame.

---

## ⬛ STYLE BLOCK (append to every prompt)

> — Premium editorial lifestyle photography, 50mm lens, f/2.0 shallow depth of
> field, soft natural window light, warm, modern, clean and uncluttered with
> tasteful negative space; cohesive high-end look across the set; square 1:1
> framing; photorealistic (not illustrated). CRITICAL: absolutely no text,
> letters, numbers, logos, watermarks, UI labels or signage anywhere — any
> screens, papers, books or cards must be blank, abstract, or softly blurred.

---

## 🏠 agentEdge — real estate (cool, precise, trustworthy)
1. **closeTrack Pro** — A real-estate agent's tidy modern desk: open laptop with a blurred calendar timeline, a labeled ring of house keys, a small architectural model house, a coffee; organized, in-control.
2. **dealReady Consult Kit** — A confident agent shaking hands with a happy couple across a bright modern table, a closed folder and tablet between them, big sunlit windows behind.
3. **farmDominate Kit** — A friendly agent greeting a neighbor at a suburban front door, a fan of blank glossy postcards in hand, golden-hour light on a tidy residential street.
4. **listGenius AI Kit** — A beautifully staged living room seen past a smartphone held up in the foreground (screen blurred), airy bright natural light, listing-marketing energy.
5. **listWin Pro** — An agent presenting on a laptop to attentive sellers at a sunlit kitchen island, a tablet with soft-blurred charts beside them, persuasive and warm.
6. **openHouse Closer OS** — A bright staged entryway styled for an open house: fresh flowers on a console, a blank tablet for sign-ins, sunlight pouring in, welcoming.

## 🛒 eComKiller — ecommerce (bold, high-energy, conversion)
7. **cartReclaim Flow Kit** — A smartphone on a vibrant desk showing a blurred checkout screen, a small parcel and a credit card nearby, punchy modern light.
8. **convertCopy Shopify Pack** — A crisp studio flatlay: a sleek unbranded product on a colored paper backdrop, a phone showing a blurred product page beside it.
9. **dropLaunch Blueprint** — A tidy launch-prep desk: neatly stacked unbranded product boxes, a laptop with a blurred calendar, blank sticky notes, confident daylight.
10. **launchVolt** — A hand holding a phone showing a blurred email inbox with a glowing notification dot, a product in soft focus behind, dynamic high-energy lighting.
11. **marginMaster Pro** — A clean desk with a laptop showing an abstract blurred profit dashboard, a calculator, a small stack of coins, a coffee; smart, profit-focused.
12. **shopCopy AI Kit** — A minimalist DTC workspace: an unbranded product being styled on a stand, laptop open beside it (blurred), soft premium studio light.

## 🏝️ bookedBNB — short-term rental (warm, welcoming hospitality)
13. **bookingBoost Kit** — A gorgeous sunlit rental living room styled for guests, a phone on the coffee table showing a blurred booking app, cozy and inviting.
14. **fiveStar Flywheel** — A welcoming entry with a small guest gift basket, a phone showing five glowing stars (no text), warm golden light, delighted-guest feeling.
15. **rateRadar STR Tracker** — A host's laptop on a rental kitchen counter with an abstract blurred revenue graph, a coffee and blank calendar nearby, bright and organized.
16. **stayBook Pro** — An elegant blank welcome book styled on a nightstand in a beautiful rental bedroom, soft lamp glow, thoughtful hospitality.
17. **stayBoost Revenue Kit** — A charming breakfast nook with a blank tablet propped up, fresh coffee and local treats, warm upscale-cozy, "add-on experience" mood.
18. **turnReady** — A pristine freshly-turned bedroom: crisp folded white linens stacked, fresh towels, a cleaning caddy in soft focus, spotless and five-star-ready.

## 🚀 coachKit — coaching (premium, growth, transformation)
19. **clientMagnet Engine** — A coach filming content on a phone-and-tripod in a bright modern space, warm confident energy, soft bokeh, aspirational.
20. **closeDeck** — A polished desk moment: a laptop, a closed signed-looking document folder (no readable text) and a nice pen, warm daylight, credible and closing.
21. **closeHigh AI Kit** — A confident coach on a discovery video call (laptop, blurred screen) in a stylish office, premium high-ticket vibe, warm directional light.
22. **coachPilot AI** — A fitness coach in a bright gym glancing at a phone (blurred app) between clients, energetic and motivating, natural light.
23. **founderForge Coaching Blueprint** — Two people mid-session at a modern table with a laptop and a blank open notebook, a softly blurred whiteboard behind, growth-strategy mood.
24. **onboardFlow Kit** — A warm client welcome kit arranged on a desk: a blank folder, a mug, a pen, a small plant, soft morning light, premium onboarding feel.

---

## Assembled example (copy-paste ready)

> A clean desk with a laptop showing an abstract blurred profit dashboard, a
> calculator, a small stack of coins, a coffee; smart, profit-focused. —
> Premium editorial lifestyle photography, 50mm lens, f/2.0 shallow depth of
> field, soft natural window light, warm, modern, clean and uncluttered with
> tasteful negative space; cohesive high-end look across the set; square 1:1
> framing; photorealistic. CRITICAL: absolutely no text, letters, numbers,
> logos, watermarks, UI labels or signage anywhere — screens/papers must be
> blank or softly blurred.

## Pipeline (when the 24 images exist)
1. Save each as `<slug>.png` (square).
2. Composite through `tools/product-image-frames.py` (adds the v2.3 branded
   frame: accent band, stat badge, FOMO tag, "created with contentOS/templateVault").
3. Upload to Supabase Storage `product-images/<id>/frame.png` (stable name,
   overwrite) — `photo_url` already points there, so the store updates live.
