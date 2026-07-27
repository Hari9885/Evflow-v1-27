# EVFLOW — Session Handoff

Read this first. State as of 2026-07-27 (Day 1 of 5-day hackathon). Frontend track done; backend is Kishore's (separate person, Spring Boot), integrates later via one env var.

## What this is

EV trip planner, Bengaluru→Mysuru corridor. Hari = frontend + infra (this machine), Kishore = Spring Boot backend implementing the **frozen API contract** in `kishore's_work.pdf` (repo root). Contract is the law: 8 endpoints, exact JSON shapes, energy model (`segmentWh = km × baseWhPerKm + gainM × 6.0`), 30%-battery/20 km stop-insertion, charge-to-80%.

## Live things

| What | Where |
|---|---|
| Web app (prod) | https://evflow-web.vercel.app (Vercel, account harikumarreddy4115-7462) |
| Mock API | https://evflow-mock-api-production.up.railway.app (Railway project `evflow-mock-api`) |
| Repo (public) | https://github.com/Hari9885/Evflow-v1-27 |
| Android APK | `Kishore-v1/EVFLOW.apk` (Capacitor shell loading the live web URL, debug-signed) |

## Layout (everything under ~/Desktop/EVFLOW/)

- `Kishore-v1/evflow-web/` — Next.js frontend. Build/lint/checks green. `.env.local` (NOT in git) has NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_API_URL (→ Railway mock), ANTHROPIC_API_KEY. Same vars set on Vercel.
- `Kishore-v1/mock-api/` — zero-dep Node mirror of the contract, `node server.js` (:8080), `node test.js` self-check.
- `Kishore-v1/evflow-app/` — Capacitor Android shell. Rebuild: `cd android && ./gradlew assembleDebug` with ANDROID_HOME=/opt/homebrew/share/android-commandlinetools, JAVA_HOME=/opt/homebrew/opt/openjdk@21.
- Planning docs (`EV_App_5Day_Roadmap.md` is the schedule being followed; others are vision/pitch material).

## Open items (the actual to-do)

1. **Anthropic credits** — assistant fully wired (route `app/api/assistant/route.ts`, Opus 5, 3 tools) but API returns "credit balance too low". User buys credits; zero code change needed. Then run the 4 demo questions: "how's my battery", "find me a charger", "how far to the next stop", "what's near this charger".
2. **Kishore integration** — when his Spring Boot is live: swap `NEXT_PUBLIC_API_URL` in Vercel env + `.env.local`, redeploy. Nothing else. His Day-1 deliverable is a deployed base URL.
3. **Day 4-5 roadmap items** — demo rehearsal ×5, screen-recorded fallback, pitch deck (roadmap slide = the deliberate cuts: voice, BLE/OBD, 2W/bus, real-time OCPI).
4. **Phone test** — user hadn't confirmed testing live app on phone yet.

## Gotchas / decisions already made (don't re-litigate)

- Web-not-native was a deliberate Day-1 cut; APK is a WebView wrapper, native rebuild is post-hackathon roadmap.
- Contract nuance: "no stop within next 20 km" implemented as anti-stacking ("no stop in last 20 km") in mock — Kishore was to be told so his version matches. Verify he knows.
- Assistant model = claude-opus-5 low effort; swap to claude-haiku-4-5-20251001 if demo latency/credits hurt (one line in `app/api/assistant/route.ts`).
- `capacitor.config.json` (not .ts) — installed TypeScript 6 breaks Capacitor's TS config loader. Keep JSON.
- Google Maps key is referrer-restricted; if map breaks on a new domain, add it in GCP Credentials. Uses legacy Marker/Autocomplete/PlacesService APIs (deprecation warnings OK; migrate only if Google gates new keys).
- `Kishore-v1.zip` on Desktop contains `.env.local` with the real Anthropic key — user was warned NOT to send it. If still present, delete it or rebuild clean.
- evflow-web had an inner `.git`; removed when the monorepo was created. Repo root = `~/Desktop/EVFLOW/`.
- Railway CLI + Vercel CLI + gh (Hari9885) all logged in on this machine.

## Run locally

```bash
node Kishore-v1/mock-api/server.js                 # or point env at Railway
cd Kishore-v1/evflow-web && npm run dev            # localhost:3000
```

Memory file for this project: `~/.claude/projects/-Users-harikumar/memory/evflow-project.md`.
