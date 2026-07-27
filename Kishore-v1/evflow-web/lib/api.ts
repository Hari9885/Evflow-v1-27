// EVFLOW REST client — the only place fetch() is called.
// Contract is frozen; field names must match the backend exactly.

export type Vehicle = {
  id: string;
  name: string;
  batteryKwh: number;
  baseWhPerKm: number;
  connectorType: string;
  maxChargeKw: number;
};

export type Charger = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  powerKw: number;
  connectorTypes: string[];
  operator: string;
  address: string;
  verified: boolean;
};

export type PlanPoint = {
  lat: number;
  lng: number;
  distanceKm: number;
  elevationM: number;
};

export type ChargingStop = {
  charger: Charger;
  atDistanceKm: number;
  arrivalBatteryPercent: number;
  chargeToPercent: number;
  estChargeMinutes: number;
};

export type RoutePlan = {
  feasible: boolean;
  totalDistanceKm: number;
  totalEnergyKwh: number;
  batteryCurve: { distanceKm: number; batteryPercent: number }[];
  chargingStops: ChargingStop[];
};

export type Trip = { id: string; startedAt: string };

// Raw record from GET /api/trips. Completed trips carry the summary fields.
export type TripRecord = {
  id: string;
  vehicleId: string;
  originName: string;
  destName: string;
  plannedDistanceKm: number;
  startedAt: string;
  completed: boolean;
  distanceKm?: number;
  energyKwh?: number;
  costInr?: number;
  durationMin?: number;
  avgWhPerKm?: number;
};

export type TripSummary = {
  id: string;
  distanceKm: number;
  energyKwh: number;
  costInr: number;
  durationMin: number;
  avgWhPerKm: number;
};

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw new Error(`Cannot reach EVFLOW API at ${BASE} — is it running?`);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body: { error?: { code?: string; message?: string } } = await res.json();
      if (body.error?.message) message = body.error.message;
    } catch {
      // non-JSON error body — keep the status message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  vehicles: () => request<Vehicle[]>("/api/vehicles"),

  chargers: (b: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
    connector?: string;
  }) => {
    const q = new URLSearchParams({
      minLat: String(b.minLat),
      minLng: String(b.minLng),
      maxLat: String(b.maxLat),
      maxLng: String(b.maxLng),
    });
    if (b.connector) q.set("connector", b.connector);
    return request<Charger[]>(`/api/chargers?${q}`);
  },

  charger: (id: string) => request<Charger>(`/api/chargers/${id}`),

  planRoute: (body: {
    vehicleId: string;
    startBatteryPercent: number;
    points: PlanPoint[];
  }) => request<RoutePlan>("/api/route/plan", post(body)),

  startTrip: (body: {
    vehicleId: string;
    originName: string;
    destName: string;
    plannedDistanceKm: number;
  }) => request<Trip>("/api/trips", post(body)),

  completeTrip: (id: string) =>
    request<TripSummary>(`/api/trips/${id}/complete`, post({})),

  trips: () => request<TripRecord[]>("/api/trips"),
};
