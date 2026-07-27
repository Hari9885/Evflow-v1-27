// Sanity check for lib/elevation.ts pure helpers. Run: node scripts/check.mjs
// (Node >= 23 strips TS types natively.)
import assert from "node:assert/strict";
import { haversineKm, sampleRoute } from "../lib/elevation.ts";

// --- haversineKm ---
assert.equal(haversineKm({ lat: 12, lng: 77 }, { lat: 12, lng: 77 }), 0);
const oneDegLat = haversineKm({ lat: 12, lng: 77 }, { lat: 13, lng: 77 });
assert.ok(Math.abs(oneDegLat - 111.19) < 0.5, `1° lat should be ~111.19 km, got ${oneDegLat}`);

// --- sampleRoute: edge cases ---
assert.deepEqual(sampleRoute([]), []);
assert.deepEqual(sampleRoute([{ lat: 12, lng: 77 }]), [{ lat: 12, lng: 77, distanceKm: 0 }]);
assert.equal(sampleRoute([{ lat: 12, lng: 77 }, { lat: 12, lng: 77 }]).length, 1); // zero-length path

// --- sampleRoute: straight line north, 11 vertices 0.01° apart (~11.12 km) ---
const line = Array.from({ length: 11 }, (_, i) => ({ lat: 12 + i * 0.01, lng: 77 }));
const total = 10 * haversineKm(line[0], line[1]);
const sampled = sampleRoute(line, 2, 150);
assert.equal(sampled.length, Math.floor(total / 2) + 1, "one point per ~2 km plus start");
assert.equal(sampled[0].distanceKm, 0, "starts at 0 km");
assert.ok(Math.abs(sampled.at(-1).distanceKm - total) < 0.01, "ends at total distance");
for (let i = 1; i < sampled.length; i++) {
  assert.ok(sampled[i].distanceKm > sampled[i - 1].distanceKm, "cumulative distance is increasing");
}
// interpolated latitude matches fraction of distance travelled
for (const p of sampled) {
  const expectedLat = 12 + (p.distanceKm / total) * 0.1;
  assert.ok(Math.abs(p.lat - expectedLat) < 1e-4, `lat interpolation off at ${p.distanceKm} km`);
}

// --- sampleRoute: cap at maxPoints on a long route (~890 km) ---
const long = Array.from({ length: 401 }, (_, i) => ({ lat: 8 + i * 0.02, lng: 77 }));
const capped = sampleRoute(long, 2, 150);
assert.equal(capped.length, 150, "capped at 150 points");
const longTotal = 400 * haversineKm(long[0], long[1]);
assert.ok(Math.abs(capped.at(-1).distanceKm - longTotal) < 0.01, "cap still reaches route end");

console.log("check.mjs: all assertions passed");
