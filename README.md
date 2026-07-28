# EVFLOW

EV trip planner for India — Bengaluru→Mysuru demo corridor. Plans routes with a battery
model, auto-inserts charging stops at the 30% threshold, shows cafes near chargers, logs
trips, and answers questions via an in-app AI assistant.

**Live:** https://evflow-web.vercel.app · **Android:** `Kishore-v1/EVFLOW.apk`

## Layout

| Path | What |
|---|---|
| `Kishore-v1/evflow-web/` | Next.js frontend (maps, planner, battery curve, assistant) |
| `Kishore-v1/mock-api/` | Zero-dependency Node mock of the backend contract (deployed on Railway) |
| `Kishore-v1/evflow-app/` | Capacitor Android shell wrapping the live web app |
| `kishore's_work.pdf` | Backend scope + frozen API contract (Spring Boot, in progress) |
| `EV_App_5Day_Roadmap.md` + other docs | Planning docs |

## Run

```bash
node Kishore-v1/mock-api/server.js            # API on :8080
cd Kishore-v1/evflow-web && npm i && npm run dev
```

`evflow-web/.env.local` needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_API_URL`,
`ANTHROPIC_API_KEY` (see `.env.local.example`).

## Team

- Hari — frontend, mock API, Android shell, deploys
- Kishore — Spring Boot backend implementing the frozen contract

Built with help of Claude.
