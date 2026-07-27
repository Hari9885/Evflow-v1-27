"use client";

import { useCallback, useEffect, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import MapPanel from "@/components/MapPanel";
import PlannerSheet, { type PlannerState } from "@/components/PlannerSheet";
import { api, errorMessage, type Charger } from "@/lib/api";
import { buildPlanPoints } from "@/lib/elevation";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const LIBRARIES: "places"[] = ["places"];

const INITIAL: PlannerState = {
  step: "vehicle",
  vehicles: [],
  vehicleId: null,
  startBatteryPercent: 90,
  origin: null,
  dest: null,
  directions: null,
  plan: null,
  chargers: [],
  selectedCharger: null,
  trip: null,
  summary: null,
  busy: null,
  error: null,
};

// Separate component so useJsApiLoader only mounts when a key exists;
// without a key the same tree renders with isLoaded=false.
function MapsLoader({ children }: { children: (isLoaded: boolean) => React.ReactNode }) {
  const { isLoaded } = useJsApiLoader({
    id: "evflow-gmaps",
    googleMapsApiKey: MAPS_KEY,
    libraries: LIBRARIES,
  });
  return <>{children(isLoaded)}</>;
}

export default function Home() {
  const [state, setState] = useState<PlannerState>(INITIAL);
  const patch = useCallback(
    (p: Partial<PlannerState>) => setState((s) => ({ ...s, ...p })),
    []
  );

  const loadVehicles = useCallback(() => {
    api
      .vehicles()
      .then((vehicles) => patch({ vehicles, error: null }))
      .catch((e: unknown) => patch({ error: errorMessage(e) }));
  }, [patch]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  async function planTrip() {
    const { origin, dest, vehicleId, startBatteryPercent, vehicles } = state;
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!origin || !dest || !vehicle) return;
    patch({ busy: "planning", error: null });
    try {
      const directions = await new google.maps.DirectionsService().route({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: dest.lat, lng: dest.lng },
        travelMode: google.maps.TravelMode.DRIVING,
      });
      const points = await buildPlanPoints(directions);
      const plan = await api.planRoute({
        vehicleId: vehicle.id,
        startBatteryPercent,
        points,
      });

      // Chargers in the route bounding box. Pins are secondary to the plan,
      // so a failure here still shows the result (message still surfaces).
      let chargers: Charger[] = [];
      let chargerError: string | null = null;
      const bounds = directions.routes[0]?.bounds;
      if (bounds) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        try {
          chargers = await api.chargers({
            minLat: sw.lat(),
            minLng: sw.lng(),
            maxLat: ne.lat(),
            maxLng: ne.lng(),
            connector: vehicle.connectorType,
          });
        } catch (e) {
          chargerError = errorMessage(e);
        }
      }

      patch({
        directions,
        plan,
        chargers,
        step: "result",
        busy: null,
        trip: null,
        summary: null,
        selectedCharger: null,
        error: chargerError,
      });
    } catch (e) {
      patch({ busy: null, error: errorMessage(e) });
    }
  }

  async function startTrip() {
    const { vehicleId, origin, dest, plan } = state;
    if (!vehicleId || !origin || !dest || !plan) return;
    patch({ busy: "starting", error: null });
    try {
      const trip = await api.startTrip({
        vehicleId,
        originName: origin.name,
        destName: dest.name,
        plannedDistanceKm: plan.totalDistanceKm,
      });
      patch({ trip, busy: null });
    } catch (e) {
      patch({ busy: null, error: errorMessage(e) });
    }
  }

  async function completeTrip() {
    if (!state.trip) return;
    patch({ busy: "completing", error: null });
    try {
      const summary = await api.completeTrip(state.trip.id);
      patch({ summary, busy: null });
    } catch (e) {
      patch({ busy: null, error: errorMessage(e) });
    }
  }

  function reset() {
    setState((s) => ({
      ...INITIAL,
      vehicles: s.vehicles,
      vehicleId: s.vehicleId,
      startBatteryPercent: s.startBatteryPercent,
      step: "route",
    }));
  }

  const body = (isLoaded: boolean) => (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-white shadow-xl">
      <div className="relative h-[55dvh] shrink-0">
        <MapPanel
          hasKey={!!MAPS_KEY}
          isLoaded={isLoaded}
          directions={state.directions}
          chargers={state.chargers}
          stops={state.plan?.chargingStops ?? []}
          onSelectCharger={(c) => patch({ selectedCharger: c })}
        />
        <header className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 shadow">
          <span className="text-sm font-bold tracking-tight text-blue-700">EVFLOW</span>
        </header>
      </div>
      <PlannerSheet
        state={state}
        hasKey={!!MAPS_KEY}
        isLoaded={isLoaded}
        onPatch={patch}
        onPlan={planTrip}
        onStartTrip={startTrip}
        onCompleteTrip={completeTrip}
        onReset={reset}
        onRetryVehicles={loadVehicles}
      />
    </main>
  );

  return MAPS_KEY ? <MapsLoader>{body}</MapsLoader> : body(false);
}
