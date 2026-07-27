// EVFLOW mock API — zero-dependency stand-in for the Spring Boot backend.
// EV trip planner, Bengaluru -> Mysuru (NH275) demo corridor. Node stdlib only.
const http = require('http');

const PORT = process.env.PORT || 8080;

// ---- energy model constants ----
const CLIMB_WH_PER_M = 6.0;      // extra Wh per metre of climb
const RATE_INR_PER_KWH = 18;     // charging cost
const LOW_BATTERY_PCT = 30;      // plan a stop when battery drops below this
const CHARGE_TO_PCT = 80;        // stops charge to 80%
const STOP_SPACING_KM = 20;      // no new stop within 20 km of an already-planned one
const SEARCH_BACK_KM = 30;       // look for chargers near route points in the last 30 km
const CHARGER_NEAR_KM = 5;       // charger must be within 5 km of a route point
const CHARGER_EFFICIENCY = 0.9;  // charging losses

// ---- in-memory data ----
const vehicles = [
  { id: 1, name: 'Tata Nexon EV LR', batteryKwh: 40.5, baseWhPerKm: 145, connectorType: 'CCS2', maxChargeKw: 50 },
  { id: 2, name: 'MG ZS EV', batteryKwh: 50.3, baseWhPerKm: 170, connectorType: 'CCS2', maxChargeKw: 76 },
  { id: 3, name: 'Tata Tiago EV', batteryKwh: 24.0, baseWhPerKm: 110, connectorType: 'CCS2', maxChargeKw: 25 },
];
let nextVehicleId = 4;

// 18 chargers along NH275, ordered Bengaluru -> Mysuru.
const CH = (id, name, lat, lng, powerKw, connectorTypes, operator, address) =>
  ({ id, name, lat, lng, powerKw, connectorTypes, operator, address, verified: true });
const chargers = [
  CH(1, 'Tata Power EZ Charge - Cubbon Park', 12.9763, 77.5929, 50, ['CCS2'], 'Tata Power', 'Queens Rd, Bengaluru'),
  CH(2, 'Statiq - Majestic Metro Hub', 12.9591, 77.5722, 60, ['CCS2'], 'Statiq', 'KG Circle, Bengaluru'),
  CH(3, 'Ather Grid - Jayanagar 4th Block', 12.9280, 77.5832, 7.2, ['AC'], 'Ather Grid', 'Jayanagar, Bengaluru'),
  CH(4, 'Tata Power EZ Charge - RR Nagar', 12.9270, 77.5190, 30, ['CCS2'], 'Tata Power', 'Mysore Rd, Rajarajeshwari Nagar, Bengaluru'),
  CH(5, 'ChargeZone - Kengeri Satellite Town', 12.9066, 77.4867, 60, ['CCS2'], 'ChargeZone', 'Mysore Rd, Kengeri, Bengaluru'),
  CH(6, 'Statiq - Bidadi Industrial Area', 12.7972, 77.3844, 30, ['CCS2'], 'Statiq', 'NH275, Bidadi'),
  CH(7, 'Tata Power EZ Charge - Ramanagara', 12.7285, 77.2952, 25, ['CCS2'], 'Tata Power', 'BM Rd, Ramanagara'),
  CH(8, 'ChargeZone - Ramanagara Bypass', 12.7100, 77.2680, 50, ['CCS2'], 'ChargeZone', 'NH275 Bypass, Ramanagara'),
  CH(9, 'Statiq - Channapatna Toy Mart', 12.6532, 77.2086, 60, ['CCS2'], 'Statiq', 'BM Rd, Channapatna'),
  CH(10, 'Tata Power EZ Charge - Maddur', 12.5850, 77.0430, 50, ['CCS2'], 'Tata Power', 'NH275, Maddur'),
  CH(11, 'Statiq - Maddur Coffee Stop', 12.5905, 77.0552, 30, ['CCS2'], 'Statiq', 'Maddur Tiffanys Rd, Maddur'),
  CH(12, 'ChargeZone - Mandya City', 12.5223, 76.9007, 60, ['CCS2'], 'ChargeZone', 'BM Rd, Mandya'),
  CH(13, 'Ather Grid - Mandya', 12.5170, 76.8890, 7.2, ['AC'], 'Ather Grid', 'VV Rd, Mandya'),
  CH(14, 'Statiq - Pandavapura Junction', 12.4730, 76.7930, 50, ['CCS2'], 'Statiq', 'NH275, Pandavapura Cross'),
  CH(15, 'Tata Power EZ Charge - Srirangapatna', 12.4218, 76.6923, 25, ['CCS2'], 'Tata Power', 'Fort Rd, Srirangapatna'),
  CH(16, 'Statiq - Mysuru Ring Road', 12.3310, 76.6660, 60, ['CCS2'], 'Statiq', 'Outer Ring Rd, Mysuru'),
  CH(17, 'Tata Power EZ Charge - Mysuru Palace', 12.3068, 76.6540, 50, ['CCS2'], 'Tata Power', 'Sayyaji Rao Rd, Mysuru'),
  CH(18, 'Ather Grid - VV Mohalla', 12.3175, 76.6415, 7.2, ['AC'], 'Ather Grid', 'Vontikoppal, Mysuru'),
];

const trips = []; // newest first
let nextTripId = 1;

// ---- helpers ----
const round2 = n => Math.round(n * 100) / 100;

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(body));
}
const fail = (res, status, code, message) => send(res, status, { error: { code, message } });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => {
      if (!data.trim()) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(Object.assign(new Error('request body is not valid JSON'), { badJson: true })); }
    });
    req.on('error', reject);
  });
}

// ---- route planner ----
// ponytail: full re-walk of the curve after each inserted stop; O(stops*points), fine at mock scale.
function planRoute(vehicle, startPercent, points) {
  const stops = []; // { pointIndex, charger, atDistanceKm, arrivalBatteryPercent, chargeToPercent, estChargeMinutes }
  for (;;) {
    const curve = [{ distanceKm: points[0].distanceKm, batteryPercent: round2(startPercent) }];
    let pct = startPercent;
    let totalWh = 0;
    let needStopBefore = -1;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1], p = points[i];
      const segKm = p.distanceKm - prev.distanceKm;
      const gainM = Math.max(0, (p.elevationM || 0) - (prev.elevationM || 0));
      const segWh = segKm * vehicle.baseWhPerKm + gainM * CLIMB_WH_PER_M;
      totalWh += segWh;
      pct -= (segWh / (vehicle.batteryKwh * 1000)) * 100;
      curve.push({ distanceKm: p.distanceKm, batteryPercent: round2(pct) });
      const stop = stops.find(s => s.pointIndex === i);
      if (stop) {
        stop.arrivalBatteryPercent = round2(pct);
        const arrivalKwh = (pct / 100) * vehicle.batteryKwh;
        const targetKwh = (CHARGE_TO_PCT / 100) * vehicle.batteryKwh;
        const rateKw = Math.min(stop.charger.powerKw, vehicle.maxChargeKw);
        stop.estChargeMinutes = Math.round(Math.max(0, targetKwh - arrivalKwh) / rateKw / CHARGER_EFFICIENCY * 60);
        pct = CHARGE_TO_PCT;
        curve.push({ distanceKm: p.distanceKm, batteryPercent: CHARGE_TO_PCT });
        continue;
      }
      if (pct < LOW_BATTERY_PCT && !stops.some(s => p.distanceKm - s.atDistanceKm < STOP_SPACING_KM)) {
        needStopBefore = i;
        break;
      }
    }
    if (needStopBefore === -1) {
      return {
        feasible: true,
        totalDistanceKm: round2(points[points.length - 1].distanceKm - points[0].distanceKm),
        totalEnergyKwh: round2(totalWh / 1000),
        batteryCurve: curve,
        chargingStops: stops.map(({ pointIndex, ...s }) => s),
      };
    }
    // Candidate chargers: connector match, unused, within 5 km of a route point in the last 30 km.
    const dHere = points[needStopBefore].distanceKm;
    const cand = new Map(); // charger.id -> { charger, pointIndex, dist }
    for (let j = 0; j <= needStopBefore; j++) {
      const pt = points[j];
      if (dHere - pt.distanceKm > SEARCH_BACK_KM) continue;
      if (stops.some(s => s.pointIndex === j)) continue;
      for (const c of chargers) {
        if (!c.connectorTypes.includes(vehicle.connectorType)) continue;
        if (stops.some(s => s.charger.id === c.id)) continue;
        const d = haversineKm(pt.lat, pt.lng, c.lat, c.lng);
        if (d > CHARGER_NEAR_KM) continue;
        const prevBest = cand.get(c.id);
        if (!prevBest || d < prevBest.dist) cand.set(c.id, { charger: c, pointIndex: j, dist: d });
      }
    }
    let best = null;
    for (const v of cand.values()) if (!best || v.charger.powerKw > best.charger.powerKw) best = v;
    if (!best) {
      return {
        feasible: false,
        reason: 'no compatible charger',
        error: { code: 'ROUTE_INFEASIBLE', message: `no compatible charger within ${CHARGER_NEAR_KM} km of the route in the last ${SEARCH_BACK_KM} km` },
        totalDistanceKm: round2(dHere - points[0].distanceKm),
        batteryCurve: curve,
        chargingStops: stops.map(({ pointIndex, ...s }) => s),
      };
    }
    stops.push({
      pointIndex: best.pointIndex,
      charger: best.charger,
      atDistanceKm: points[best.pointIndex].distanceKm,
      arrivalBatteryPercent: 0, // filled in on re-walk
      chargeToPercent: CHARGE_TO_PCT,
      estChargeMinutes: 0,
    });
    stops.sort((a, b) => a.pointIndex - b.pointIndex);
  }
}

// ---- HTTP ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }

    if (req.method === 'GET' && path === '/api/vehicles') return send(res, 200, vehicles);

    if (req.method === 'POST' && path === '/api/vehicles') {
      const b = await readBody(req);
      const nums = ['batteryKwh', 'baseWhPerKm', 'maxChargeKw'];
      if (typeof b.name !== 'string' || !b.name.trim() || typeof b.connectorType !== 'string' ||
          nums.some(k => typeof b[k] !== 'number' || !(b[k] > 0))) {
        return fail(res, 400, 'VALIDATION_ERROR', 'name, connectorType (strings) and positive batteryKwh, baseWhPerKm, maxChargeKw (numbers) are required');
      }
      const v = { id: nextVehicleId++, name: b.name, batteryKwh: b.batteryKwh, baseWhPerKm: b.baseWhPerKm, connectorType: b.connectorType, maxChargeKw: b.maxChargeKw };
      vehicles.push(v);
      return send(res, 201, v);
    }

    if (req.method === 'GET' && path === '/api/chargers') {
      const q = url.searchParams;
      const num = k => (q.get(k) ? Number(q.get(k)) : null);
      const minLat = num('minLat'), minLng = num('minLng'), maxLat = num('maxLat'), maxLng = num('maxLng');
      const connector = q.get('connector');
      return send(res, 200, chargers.filter(c =>
        (minLat === null || c.lat >= minLat) &&
        (maxLat === null || c.lat <= maxLat) &&
        (minLng === null || c.lng >= minLng) &&
        (maxLng === null || c.lng <= maxLng) &&
        (!connector || c.connectorTypes.includes(connector))));
    }

    let m = path.match(/^\/api\/chargers\/(\d+)$/);
    if (req.method === 'GET' && m) {
      const c = chargers.find(x => x.id === Number(m[1]));
      return c ? send(res, 200, c) : fail(res, 404, 'CHARGER_NOT_FOUND', `no charger with id ${m[1]}`);
    }

    if (req.method === 'POST' && path === '/api/route/plan') {
      const b = await readBody(req);
      const vehicle = vehicles.find(v => v.id === Number(b.vehicleId));
      if (!vehicle) return fail(res, 404, 'VEHICLE_NOT_FOUND', `no vehicle with id ${b.vehicleId}`);
      if (!Array.isArray(b.points) || b.points.length < 2 ||
          b.points.some(p => !p || typeof p.lat !== 'number' || typeof p.lng !== 'number' || typeof p.distanceKm !== 'number')) {
        return fail(res, 400, 'VALIDATION_ERROR', 'points must be an array of >= 2 { lat, lng, distanceKm, elevationM } ordered by distanceKm');
      }
      const start = typeof b.startBatteryPercent === 'number' ? b.startBatteryPercent : 100;
      return send(res, 200, planRoute(vehicle, start, b.points));
    }

    if (req.method === 'POST' && path === '/api/trips') {
      const b = await readBody(req);
      const vehicle = vehicles.find(v => v.id === Number(b.vehicleId));
      if (!vehicle) return fail(res, 404, 'VEHICLE_NOT_FOUND', `no vehicle with id ${b.vehicleId}`);
      const trip = {
        id: nextTripId++,
        vehicleId: vehicle.id,
        originName: b.originName || '',
        destName: b.destName || '',
        plannedDistanceKm: typeof b.plannedDistanceKm === 'number' ? b.plannedDistanceKm : 0,
        startedAt: new Date().toISOString(),
        completed: false,
      };
      trips.unshift(trip);
      return send(res, 201, { id: trip.id, startedAt: trip.startedAt });
    }

    if (req.method === 'GET' && path === '/api/trips') return send(res, 200, trips);

    m = path.match(/^\/api\/trips\/(\d+)\/complete$/);
    if (req.method === 'POST' && m) {
      const trip = trips.find(t => t.id === Number(m[1]));
      if (!trip) return fail(res, 404, 'TRIP_NOT_FOUND', `no trip with id ${m[1]}`);
      const b = await readBody(req);
      const vehicle = vehicles.find(v => v.id === trip.vehicleId);
      const distanceKm = typeof b.distanceKm === 'number' ? b.distanceKm : trip.plannedDistanceKm;
      const energyKwh = typeof b.energyKwh === 'number' ? b.energyKwh
        : round2(distanceKm * vehicle.baseWhPerKm / 1000);
      Object.assign(trip, {
        completed: true,
        distanceKm,
        energyKwh,
        costInr: round2(energyKwh * RATE_INR_PER_KWH),
        durationMin: Math.round((Date.now() - Date.parse(trip.startedAt)) / 60000),
        avgWhPerKm: distanceKm > 0 ? round2(energyKwh * 1000 / distanceKm) : 0,
      });
      return send(res, 200, {
        id: trip.id, distanceKm, energyKwh,
        costInr: trip.costInr, durationMin: trip.durationMin, avgWhPerKm: trip.avgWhPerKm,
      });
    }

    return fail(res, 404, 'NOT_FOUND', `${req.method} ${path} is not part of the mock API`);
  } catch (e) {
    if (e.badJson) return fail(res, 400, 'INVALID_JSON', e.message);
    return fail(res, 500, 'INTERNAL_ERROR', e.message);
  }
});

server.listen(PORT, () => console.log(`EVFLOW mock API listening on http://localhost:${PORT}`));
