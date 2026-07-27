// Dry-run of the assistant tool executors against a fabricated snapshot.
// Run: node scripts/check-assistant.mjs  — mock API on :8080 must be running
// for the find_chargers assertions. (Node >= 23 strips TS types natively.)
import assert from "node:assert/strict";
import { executeTool, snapshotContext } from "../lib/assistant-tools.ts";

const mandya = { lat: 12.5223, lng: 76.9007 };
const snapshot = {
  vehicle: {
    id: "1",
    name: "Tata Nexon EV LR",
    batteryKwh: 40.5,
    baseWhPerKm: 145,
    connectorType: "CCS2",
    maxChargeKw: 50,
  },
  startBatteryPercent: 90,
  origin: { name: "Bengaluru", lat: 12.9716, lng: 77.5946 },
  dest: { name: "Mysuru", lat: 12.3052, lng: 76.6552 },
  plan: {
    feasible: true,
    totalDistanceKm: 143.5,
    totalEnergyKwh: 21.9,
    batteryCurve: [
      { distanceKm: 0, batteryPercent: 90 },
      { distanceKm: 143.5, batteryPercent: 34.2 },
    ],
    chargingStops: [
      {
        charger: {
          id: "12",
          name: "ChargeZone - Mandya City",
          ...mandya,
          powerKw: 60,
          connectorTypes: ["CCS2"],
          operator: "ChargeZone",
          address: "BM Rd, Mandya",
          verified: true,
        },
        atDistanceKm: 98.2,
        arrivalBatteryPercent: 28.4,
        chargeToPercent: 80,
        estChargeMinutes: 26,
      },
    ],
  },
  selectedCharger: { name: "ChargeZone - Mandya City", ...mandya },
  tripStatus: "in_progress",
};

// --- get_battery_status ---
const battery = JSON.parse(await executeTool("get_battery_status", {}, snapshot));
assert.equal(battery.currentBatteryPercent, 90);
assert.equal(battery.projectedArrivalPercent, 34.2, "arrival % is last curve point");
assert.equal(battery.totalEnergyKwh, 21.9);

const noPlan = JSON.parse(
  await executeTool("get_battery_status", {}, { ...snapshot, plan: null })
);
assert.equal(noPlan.projectedArrivalPercent, null, "no plan -> no arrival projection");

// --- get_route_status ---
const route = JSON.parse(await executeTool("get_route_status", {}, snapshot));
assert.equal(route.feasible, true);
assert.equal(route.remainingDistanceKm, 143.5);
assert.equal(route.tripStatus, "in_progress");
assert.equal(route.nextStop.name, "ChargeZone - Mandya City");
assert.equal(route.nextStop.atKm, 98.2);
assert.equal(route.nextStop.estChargeMinutes, 26);
assert.deepEqual(
  JSON.parse(await executeTool("get_route_status", {}, { ...snapshot, plan: null })),
  { note: "no route planned yet" }
);

// --- snapshot context carries coords the model needs for find_chargers ---
const ctx = snapshotContext(snapshot);
assert.ok(ctx.includes("12.5223"), "selected charger coords in context");
assert.ok(ctx.includes("Bengaluru -> Mysuru"), "origin/dest names in context");

// --- find_chargers hits the mock API (node ../mock-api/server.js) ---
const found = JSON.parse(
  await executeTool("find_chargers", { ...mandya, connector: "CCS2" }, snapshot)
);
assert.ok(found.length >= 1 && found.length <= 5, `1-5 chargers, got ${found.length}`);
for (let i = 1; i < found.length; i++) {
  assert.ok(found[i - 1].powerKw >= found[i].powerKw, "sorted by powerKw desc");
}
for (const c of found) {
  assert.ok(
    Math.abs(c.lat - mandya.lat) <= 0.15 && Math.abs(c.lng - mandya.lng) <= 0.15,
    `${c.name} outside the 0.15° bounding box`
  );
  assert.ok(c.connectorTypes.includes("CCS2"), "connector filter applied");
}

// --- bad input / unknown tool must throw (route turns this into is_error) ---
await assert.rejects(() => executeTool("find_chargers", {}, snapshot), /lat and lng/);
await assert.rejects(() => executeTool("nope", {}, snapshot), /unknown tool/);

console.log("check-assistant.mjs: all assertions passed");
