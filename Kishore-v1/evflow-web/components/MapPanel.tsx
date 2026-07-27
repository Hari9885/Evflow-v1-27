"use client";

import { useCallback, useEffect, useRef } from "react";
import { GoogleMap, DirectionsRenderer, Marker } from "@react-google-maps/api";
import type { Charger, ChargingStop } from "@/lib/api";

// Between Bengaluru and Mysuru — the demo corridor.
const CENTER = { lat: 12.63, lng: 77.1 };

type Props = {
  hasKey: boolean;
  isLoaded: boolean;
  directions: google.maps.DirectionsResult | null;
  chargers: Charger[];
  stops: ChargingStop[];
  onSelectCharger: (c: Charger) => void;
};

export default function MapPanel({
  hasKey,
  isLoaded,
  directions,
  chargers,
  stops,
  onSelectCharger,
}: Props) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const onLoad = useCallback((m: google.maps.Map) => {
    mapRef.current = m;
  }, []);

  useEffect(() => {
    const bounds = directions?.routes[0]?.bounds;
    if (bounds && mapRef.current) mapRef.current.fitBounds(bounds, 32);
  }, [directions]);

  if (!hasKey) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-200 p-6">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Google Maps key missing</p>
          <p className="mt-1">
            Add <code className="rounded bg-amber-100 px-1 font-mono text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
            to <code className="rounded bg-amber-100 px-1 font-mono text-xs">.env.local</code> and
            restart the dev server. The planner below still works.
          </p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-200">
        <p className="text-sm text-stone-500">Loading map…</p>
      </div>
    );
  }

  const stopIds = new Set(stops.map((s) => s.charger.id));

  return (
    <GoogleMap
      onLoad={onLoad}
      mapContainerClassName="h-full w-full"
      center={CENTER}
      zoom={9}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
      }}
    >
      {directions && (
        <DirectionsRenderer
          directions={directions}
          options={{ polylineOptions: { strokeColor: "#2a78d6", strokeWeight: 5 } }}
        />
      )}
      {/* all chargers in the route bounding box — dim gray pins */}
      {chargers
        .filter((c) => !stopIds.has(c.id))
        .map((c) => (
          <Marker
            key={c.id}
            position={{ lat: c.lat, lng: c.lng }}
            title={c.name}
            onClick={() => onSelectCharger(c)}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: "#9ca3af",
              fillOpacity: 0.9,
              strokeColor: "#ffffff",
              strokeWeight: 1.5,
            }}
          />
        ))}
      {/* planned stops — highlighted + numbered */}
      {stops.map((s, i) => (
        <Marker
          key={s.charger.id}
          position={{ lat: s.charger.lat, lng: s.charger.lng }}
          title={s.charger.name}
          onClick={() => onSelectCharger(s.charger)}
          zIndex={10}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 11,
            fillColor: "#2a78d6",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          }}
          label={{
            text: String(i + 1),
            color: "#ffffff",
            fontSize: "12px",
            fontWeight: "700",
          }}
        />
      ))}
    </GoogleMap>
  );
}
