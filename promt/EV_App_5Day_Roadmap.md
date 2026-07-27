# EV App — 5-Day Sprint: Requirements + Roadmap

**Goal:** working, demo-able product by end of Day 4. Day 5 = buffer + polish + pitch prep.
**Scope for this sprint:** Bengaluru → Mysuru corridor (or any 2 Bengaluru-area points), **cars only** (skip 2W/bus — mention as roadmap in pitch), **web app** not native mobile, **text assistant** not voice.

Why these cuts: native mobile build/signing eats a full day for nothing demo-visible. Voice adds STT/TTS latency debugging you don't have time for. 2W/bus telemetry has no good data source to demo against. Cutting these isn't lowering ambition — it's what lets everything else actually work by Day 4.

---

## 1. Requirements before you write code

### Accounts / API keys (get these on Day 1, morning, before anything else)
| Service | Use | Notes |
|---|---|---|
| Google Cloud Platform account | Maps JS API, Directions API, Places API, Elevation API | Free tier covers a hackathon demo easily; enable billing (required even for free tier) to avoid quota walls mid-demo |
| Open Charge Map | Charger location data | Free, register for an API key at openchargemap.org — no approval wait |
| Supabase (or Firebase) | Auth + Postgres DB, hosted, zero infra setup | You've used Supabase before — reuse that familiarity, don't relearn a new backend under time pressure |
| OpenAI or Anthropic API key | Chat assistant (function-calling) | Pick whichever you already have credits/experience with |
| Vercel account | Deploy + share a live demo link | Free, deploys in ~1 min per push |

### Tech stack (optimized for speed, not scale)
- **Frontend:** Next.js (React) — one codebase, deploys instantly, no mobile build pipeline
- **Maps:** Google Maps JavaScript API (`@react-google-maps/api`)
- **Backend:** Next.js API routes (skip a separate NestJS server — unnecessary layer for 4 days)
- **DB:** Supabase Postgres
- **Assistant:** OpenAI/Claude API called from a Next.js API route with 2-3 defined tools (get_route, find_charger, get_battery_status)
- **Styling:** Tailwind + shadcn/ui — fast, looks polished without design time

### Data prep (do this Day 1 afternoon, don't leave it implicit)
- Pull Open Charge Map results for Bengaluru + NH275 (Bengaluru–Mysuru highway) via their API, dump into your Supabase `chargers` table
- **Manually spot-check and fix ~15-20 chargers** on the actual route corridor — OCM data in India is sparse/stale in places, and a demo that shows a charger in the wrong spot kills credibility fast. This manual curation is worth more than any code you'll write that day.
- Seed 2-3 realistic vehicle profiles (e.g. Tata Nexon EV, MG ZS EV) with battery kWh, real-world Wh/km, connector type — use published spec sheets, don't guess

### Team role split (if not solo)
- Person A: map + routing UI
- Person B: backend (charger data, Supabase schema, energy model)
- Person C: assistant integration + demo script/pitch
If solo: follow the day order below strictly, don't let yourself polish UI before the routing logic works end-to-end.

---

## 2. Day-by-day roadmap

### Day 1 — Foundation + data
- [ ] Get all API keys (30 min, do this first, not last)
- [ ] `npx create-next-app`, Tailwind + shadcn setup, push empty app to Vercel to confirm deploy pipeline works *now*, not on Day 4
- [ ] Supabase project + schema: `vehicles`, `chargers`, `trips`
- [ ] Pull + clean Open Charge Map data for the demo corridor into `chargers`
- [ ] Render Google Map with charger pins — this is your first visible milestone
- **End of day check:** map loads, shows real chargers on the route corridor. If this isn't working, everything downstream slips.

### Day 2 — Routing + battery model
- [ ] Vehicle profile form (battery kWh, connector type, avg Wh/km) → saved to Supabase
- [ ] Google Directions API: get route between origin/destination, get polyline + distance
- [ ] Google Elevation API: sample elevation along route, feed into a simple energy model:
  `energy_used = distance_km × base_Wh_per_km × (1 + elevation_gain_factor)`
- [ ] Simulate battery % depletion along the route, plot it
- [ ] Logic: if remaining range at any point < threshold AND no charger within next 20km → flag a required charging stop, insert nearest suitable charger from your DB into the route
- **End of day check:** enter origin/destination + vehicle, see a route with battery % dropping, and at least one auto-inserted charging stop when the trip needs it.

### Day 3 — Charging experience + trip logging
- [ ] Charger detail panel: connector type, rated power, nearby POIs (call Places API for "cafe near [charger lat/lng]") — this is the "relax while charging" feature made real
- [ ] 30%-threshold rule made explicit and visible: UI banner "Battery at 30% — searching for chargers..." when simulated battery crosses it
- [ ] Trip log: on "start trip" (simulated), store trip in `trips` table; on "end trip," show summary (distance, est. cost at ₹/kWh, avg efficiency)
- [ ] UI pass: mobile-width layout, clean map + bottom sheet pattern (like Google Maps/Ola) — spend max 2 hours here, function over polish
- **End of day check:** full flow works — pick vehicle → plan trip → see charger stops + POIs → "complete" trip → see a trip summary saved.

### Day 4 — Assistant + demo hardening
- [ ] Chat assistant panel: text input, calls your backend with 2-3 tools bound to real functions (`find_nearest_charger(lat,lng)`, `get_current_route_status()`, `get_battery_estimate()`)
- [ ] Test 5-6 scripted questions until they reliably work: "how's my battery," "find me a charger," "how far to the next stop," "what's near this charger"
- [ ] **Do NOT add new features today.** Bug-fix and stabilize what exists. A demo that reliably does 4 things beats one that flakily does 8.
- [ ] Prepare a **fallback**: screen-record the full working flow in case live demo/wifi fails
- **End of day check: this is your demo-ready state.** Full flow, live on Vercel, assistant answering real questions against real route/charger data.

### Day 5 — Buffer, polish, pitch
- [ ] Fix whatever broke under demo-run stress testing (run the exact demo flow 5+ times back to back)
- [ ] Tighten the pitch: lead with the gap (no good India-first EV app), show the live demo, close with the roadmap (2W/bus support, OCPI partnerships, BLE telemetry) from the earlier plan — judges reward knowing what you *didn't* build and why
- [ ] One-pager or slide deck: problem, demo, architecture diagram, roadmap
- [ ] Final deploy, test the live Vercel link on a different network/device than the one you built on

---

## 3. What "done by Day 4" actually looks like
A judge/user can: open the link on their phone → pick a vehicle → enter a Bengaluru-to-Mysuru-style trip → see the route with battery draining and a charging stop auto-inserted around 30% → tap the charger to see a nearby cafe → ask the chat assistant "how's my battery" and get a real answer → "complete" the trip and see it logged. That's a coherent, honest, working product — not a mockup.

## 4. Guardrails to stay on schedule
- If Day 2's routing/battery logic isn't solid by end of day, **cut the assistant entirely** on Day 4 rather than ship a broken core with a nice chat window — the routing is the actual product.
- Resist adding 2W/bus/voice/BLE mid-sprint even if it feels quick — every one of those is a rabbit hole disguised as a small feature.
- Keep a running list of "cut for time" items — that list becomes your roadmap slide, which is genuinely more impressive to show than pretending you built everything.
