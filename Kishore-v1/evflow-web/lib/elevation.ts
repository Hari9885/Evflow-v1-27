// Route sampling helpers. haversineKm/sampleRoute are pure (no Google objects
// at module scope) so scripts/check.mjs can import this file under plain Node.

import type { PlanPoint } from "./api";

export type LatLng = { lat: number; lng: number };
export type SampledPoint = LatLng & { distanceKm: number };

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

/**
 * Resample a polyline to ~1 point per stepKm (capped at maxPoints), endpoints
 * included, with cumulative distanceKm. Points between vertices are linearly
 * interpolated — fine at this spacing.
 */
export function sampleRoute(
  path: LatLng[],
  stepKm = 2,
  maxPoints = 150
): SampledPoint[] {
  if (path.length === 0) return [];
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + haversineKm(path[i - 1], path[i]));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return [{ lat: path[0].lat, lng: path[0].lng, distanceKm: 0 }];

  const n = Math.max(2, Math.min(maxPoints, Math.floor(total / stepKm) + 1));
  const step = total / (n - 1);
  const out: SampledPoint[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = Math.min(i * step, total);
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = Math.min(1, Math.max(0, (target - cum[j]) / seg));
    out.push({
      lat: path[j].lat + (path[j + 1].lat - path[j].lat) * t,
      lng: path[j].lng + (path[j + 1].lng - path[j].lng) * t,
      distanceKm: Math.round(target * 100) / 100,
    });
  }
  return out;
}

/**
 * DirectionsResult → points array for POST /api/route/plan, with elevation
 * sampled along the route via the Google Elevation service.
 * Browser-only (requires the Maps JS API to be loaded).
 */
export async function buildPlanPoints(
  result: google.maps.DirectionsResult
): Promise<PlanPoint[]> {
  const path = result.routes[0].overview_path.map((p) => ({
    lat: p.lat(),
    lng: p.lng(),
  }));
  const sampled = sampleRoute(path);
  let elevations = sampled.map(() => 0);
  try {
    const { results } = await new google.maps.ElevationService().getElevationForLocations({
      locations: sampled.map(({ lat, lng }) => ({ lat, lng })),
    });
    if (results.length === sampled.length) {
      elevations = results.map((r) => Math.round(r.elevation));
    }
  } catch {
    // ponytail: elevation is a refinement — a flat profile beats a failed plan
  }
  return sampled.map((p, i) => ({
    lat: p.lat,
    lng: p.lng,
    distanceKm: p.distanceKm,
    elevationM: elevations[i],
  }));
}
