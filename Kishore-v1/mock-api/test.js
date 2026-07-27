// Self-check for the EVFLOW mock API. Spawns server.js on a test port, exercises the contract.
// Run: node test.js   (exits 0 on pass, 1 on fail)
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8188;
const BASE = `http://127.0.0.1:${PORT}`;
const json = (method, url, body) =>
  fetch(BASE + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

async function waitReady() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/vehicles`)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start on port ' + PORT);
}

// Fabricated 145 km Bengaluru -> Mysuru route: points every ~2 km, positions
// interpolated along the NH275 town chain so seeded chargers sit near the line.
function buildRoute() {
  const wps = [
    [12.9716, 77.5946], [12.9066, 77.4867], [12.7972, 77.3844], [12.7217, 77.2812],
    [12.6532, 77.2086], [12.5850, 77.0430], [12.5223, 76.9007], [12.4218, 76.6923],
    [12.3068, 76.6540],
  ];
  const seg = [];
  let chainKm = 0;
  for (let i = 1; i < wps.length; i++) {
    const len = Math.hypot((wps[i][0] - wps[i - 1][0]) * 111, (wps[i][1] - wps[i - 1][1]) * 108.5);
    seg.push(len);
    chainKm += len;
  }
  const N = 73, TOTAL_KM = 145;
  const points = [];
  for (let i = 0; i < N; i++) {
    const d = (TOTAL_KM * i) / (N - 1);
    let target = (d / TOTAL_KM) * chainKm;
    let k = 0;
    while (k < seg.length - 1 && target > seg[k]) { target -= seg[k]; k++; }
    const t = Math.min(1, target / seg[k]);
    points.push({
      lat: wps[k][0] + (wps[k + 1][0] - wps[k][0]) * t,
      lng: wps[k][1] + (wps[k + 1][1] - wps[k][1]) * t,
      distanceKm: Math.round(d * 100) / 100,
      elevationM: Math.round(900 - 130 * (d / TOTAL_KM) + 40 * Math.sin(d / 18)),
    });
  }
  return points;
}

async function main() {
  // 1. vehicles seed
  const vehicles = await (await json('GET', '/api/vehicles')).json();
  assert.strictEqual(vehicles.length, 3, 'expected exactly 3 seed vehicles');
  assert.ok(vehicles.every(v => v.id && v.name && v.batteryKwh > 0 && v.baseWhPerKm > 0 && v.connectorType && v.maxChargeKw > 0),
    'vehicle shape wrong');

  // 2. chargers + bounding box + connector filter
  const all = await (await json('GET', '/api/chargers')).json();
  assert.ok(all.length >= 15, 'expected ~18 seeded chargers, got ' + all.length);
  const boxed = await (await json('GET', '/api/chargers?minLat=12.45&maxLat=12.66&minLng=76.85&maxLng=77.10')).json();
  assert.ok(boxed.length > 0 && boxed.length < all.length, 'bounding box should filter to a strict subset');
  assert.ok(boxed.every(c => c.lat >= 12.45 && c.lat <= 12.66 && c.lng >= 76.85 && c.lng <= 77.10),
    'bounding box returned a charger outside the box');
  const ac = await (await json('GET', '/api/chargers?connector=AC')).json();
  assert.ok(ac.length > 0 && ac.every(c => c.connectorTypes.includes('AC')), 'connector filter broken');

  // 3. route plan: Nexon EV (id 1), start 55%, 145 km
  const plan = await (await json('POST', '/api/route/plan',
    { vehicleId: 1, startBatteryPercent: 55, points: buildRoute() })).json();
  assert.strictEqual(plan.feasible, true, 'plan should be feasible: ' + JSON.stringify(plan.reason || plan.error || ''));
  assert.ok(plan.chargingStops.length >= 1, 'expected at least one charging stop');
  assert.ok(plan.totalDistanceKm > 100 && plan.totalEnergyKwh > 0, 'totals missing');
  const stopDs = new Set(plan.chargingStops.map(s => s.atDistanceKm));
  for (let i = 1; i < plan.batteryCurve.length; i++) {
    const a = plan.batteryCurve[i - 1], b = plan.batteryCurve[i];
    if (b.batteryPercent > a.batteryPercent + 1e-6) {
      assert.ok(a.distanceKm === b.distanceKm && stopDs.has(b.distanceKm),
        `battery rose outside a charging stop at ${b.distanceKm} km`);
    }
  }
  const stop = plan.chargingStops[0];
  assert.ok(stop.charger && stop.charger.id && stop.estChargeMinutes > 0 && stop.chargeToPercent === 80,
    'charging stop shape wrong: ' + JSON.stringify(stop));

  // 4. trips: start + complete
  const createdRes = await json('POST', '/api/trips',
    { vehicleId: 1, originName: 'Bengaluru', destName: 'Mysuru', plannedDistanceKm: 145 });
  assert.strictEqual(createdRes.status, 201, 'trip create should return 201');
  const trip = await createdRes.json();
  assert.ok(trip.id && trip.startedAt, 'trip create shape wrong');
  const done = await (await json('POST', `/api/trips/${trip.id}/complete`, { distanceKm: 145, energyKwh: 21.5 })).json();
  assert.ok(done.costInr > 0, 'costInr should be > 0');
  assert.strictEqual(done.costInr, 387, 'costInr should be energyKwh * 18');
  assert.ok(done.avgWhPerKm > 0 && done.durationMin >= 0, 'complete shape wrong');
  const list = await (await json('GET', '/api/trips')).json();
  assert.ok(list.length >= 1 && list[0].id === trip.id, 'GET /api/trips should be newest first');
}

const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'ignore', 'inherit'],
});

(async () => {
  try {
    await waitReady();
    await main();
    console.log('OK — all mock API checks passed');
    process.exitCode = 0;
  } catch (e) {
    console.error('FAIL —', e.message);
    process.exitCode = 1;
  } finally {
    server.kill();
  }
})();
