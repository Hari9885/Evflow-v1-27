// Assistant tool definitions + server-side executors for /api/assistant.
// Only type-only imports (like elevation.ts) so scripts/check-assistant.mjs
// can run this file under plain Node.

import type { Charger, RoutePlan, Vehicle } from "./api";

export type AssistantSnapshot = {
  vehicle: Vehicle | null;
  startBatteryPercent: number;
  origin: { name: string; lat: number; lng: number } | null;
  dest: { name: string; lat: number; lng: number } | null;
  plan: RoutePlan | null;
  selectedCharger: { name: string; lat: number; lng: number } | null;
  tripStatus: "not_started" | "in_progress" | "completed";
};

// Matches Anthropic's Tool shape structurally — no SDK import here.
export const ASSISTANT_TOOLS = [
  {
    name: "get_battery_status",
    description:
      "Battery status for the current trip: current battery %, projected battery % on arrival, and total energy the planned route needs.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_route_status",
    description:
      "Route status: remaining distance, next charging stop (name, at what km, arrival %, estimated charge minutes) and whether the route is feasible.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "find_chargers",
    description:
      "Look up real chargers near a coordinate (~15 km box), highest power first. Take lat/lng from the trip context (origin, destination, a planned stop, or the selected charger). Never invent chargers.",
    input_schema: {
      type: "object" as const,
      properties: {
        lat: { type: "number", description: "Latitude to search around" },
        lng: { type: "number", description: "Longitude to search around" },
        connector: {
          type: "string",
          description: "Optional connector filter, e.g. CCS2",
        },
      },
      required: ["lat", "lng"],
    },
  },
];

// Compact trip context for the system prompt — carries the coordinates the
// model needs to call find_chargers ("near this charger" / "near the next stop").
export function snapshotContext(s: AssistantSnapshot): string {
  const lines = [
    `Vehicle: ${
      s.vehicle
        ? `${s.vehicle.name} (${s.vehicle.connectorType}, ${s.vehicle.batteryKwh} kWh)`
        : "not selected yet"
    }`,
    `Trip: ${s.origin?.name ?? "?"} -> ${s.dest?.name ?? "?"} (status: ${s.tripStatus})`,
  ];
  if (s.origin) lines.push(`Origin coords: ${s.origin.lat}, ${s.origin.lng}`);
  if (s.dest) lines.push(`Destination coords: ${s.dest.lat}, ${s.dest.lng}`);
  for (const st of s.plan?.chargingStops ?? []) {
    lines.push(
      `Planned stop: ${st.charger.name} at km ${st.atDistanceKm} (coords ${st.charger.lat}, ${st.charger.lng})`
    );
  }
  if (s.selectedCharger) {
    lines.push(
      `Selected charger: ${s.selectedCharger.name} (coords ${s.selectedCharger.lat}, ${s.selectedCharger.lng})`
    );
  }
  return lines.join("\n");
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const BOX_DEG = 0.15;

// Executes one tool call server-side; returns a JSON string for the tool_result.
// Throws on bad input / backend failure — caller turns that into is_error.
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  snapshot: AssistantSnapshot
): Promise<string> {
  if (name === "get_battery_status") {
    const curve = snapshot.plan?.batteryCurve ?? [];
    return JSON.stringify({
      vehicle: snapshot.vehicle?.name ?? null,
      currentBatteryPercent: snapshot.startBatteryPercent,
      projectedArrivalPercent: curve.length
        ? curve[curve.length - 1].batteryPercent
        : null,
      totalEnergyKwh: snapshot.plan?.totalEnergyKwh ?? null,
      note: snapshot.plan ? undefined : "no route planned yet",
    });
  }

  if (name === "get_route_status") {
    const plan = snapshot.plan;
    if (!plan) return JSON.stringify({ note: "no route planned yet" });
    const next = plan.chargingStops[0] ?? null;
    return JSON.stringify({
      origin: snapshot.origin?.name ?? null,
      destination: snapshot.dest?.name ?? null,
      tripStatus: snapshot.tripStatus,
      feasible: plan.feasible,
      remainingDistanceKm: plan.totalDistanceKm,
      chargingStopCount: plan.chargingStops.length,
      nextStop: next && {
        name: next.charger.name,
        atKm: next.atDistanceKm,
        arrivalBatteryPercent: next.arrivalBatteryPercent,
        chargeToPercent: next.chargeToPercent,
        estChargeMinutes: next.estChargeMinutes,
      },
    });
  }

  if (name === "find_chargers") {
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("lat and lng must be numbers");
    }
    const q = new URLSearchParams({
      minLat: String(lat - BOX_DEG),
      minLng: String(lng - BOX_DEG),
      maxLat: String(lat + BOX_DEG),
      maxLng: String(lng + BOX_DEG),
    });
    if (typeof input.connector === "string" && input.connector) {
      q.set("connector", input.connector);
    }
    const res = await fetch(`${BASE}/api/chargers?${q}`);
    if (!res.ok) throw new Error(`charger lookup failed (${res.status})`);
    const chargers = (await res.json()) as Charger[];
    return JSON.stringify(
      [...chargers]
        .sort((a, b) => b.powerKw - a.powerKw)
        .slice(0, 5)
        .map((c) => ({
          name: c.name,
          powerKw: c.powerKw,
          connectorTypes: c.connectorTypes,
          operator: c.operator,
          address: c.address,
          lat: c.lat,
          lng: c.lng,
        }))
    );
  }

  throw new Error(`unknown tool: ${name}`);
}
