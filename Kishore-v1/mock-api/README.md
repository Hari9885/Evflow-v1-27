# EVFLOW Mock API

Zero-dependency stand-in for the Spring Boot EV trip planner backend
(Bengaluru -> Mysuru NH275 corridor). Requires Node 18+, no npm install.

    node server.js   # serves http://localhost:8080  (override with PORT=)
    node test.js     # self-check: spawns the server on 8188, exits 0/1

Endpoints: GET/POST /api/vehicles, GET /api/chargers[?minLat&minLng&maxLat&maxLng&connector],
GET /api/chargers/:id, POST /api/route/plan, POST /api/trips, GET /api/trips,
POST /api/trips/:id/complete. All JSON, CORS enabled, in-memory state.
