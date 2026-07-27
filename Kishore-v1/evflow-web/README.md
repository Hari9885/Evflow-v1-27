# EVFLOW — EV trip planner (web)

Mobile-first EV trip planner. Demo corridor: Bengaluru → Mysuru.

## Run

1. `cp .env.local.example .env.local` and set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   (Maps JavaScript, Places, Directions, Elevation APIs enabled).
2. Start the backend on port 8080 — mock: `cd ../mock-api && npm start`.
   Different URL? Set `NEXT_PUBLIC_API_URL`.
3. `npm install && npm run dev` → http://localhost:3000

Without a Maps key the UI still renders, with a setup card in the map area.

Sanity check for the route-sampling helpers: `node scripts/check.mjs`

## Assistant

The chat bar at the bottom of the sheet is a Claude-powered driving assistant
(battery, route and charger questions). Set `ANTHROPIC_API_KEY` in `.env.local`
(server-side only); without it the chat shows a setup hint. Tool executor
sanity check: `node scripts/check-assistant.mjs` (mock API running).
