"use client";

import { useEffect, useState } from "react";
import type { Charger, ChargingStop } from "@/lib/api";

type NearbyPlace = { id: string; name: string; rating?: number };

type Props = {
  charger: Charger;
  stop: ChargingStop | null;
  mapsReady: boolean;
  onClose: () => void;
};

// Mount with key={charger.id} — remounting on charger change resets `nearby`.
export default function ChargerDetail({ charger, stop, mapsReady, onClose }: Props) {
  const [nearby, setNearby] = useState<NearbyPlace[] | null>(null);

  useEffect(() => {
    if (!mapsReady || typeof google === "undefined" || !google.maps?.places) return;
    let cancelled = false;
    const svc = new google.maps.places.PlacesService(document.createElement("div"));
    const location = new google.maps.LatLng(charger.lat, charger.lng);
    const search = (type: string) =>
      new Promise<google.maps.places.PlaceResult[]>((resolve) => {
        svc.nearbySearch({ location, radius: 500, type }, (res, status) =>
          resolve(status === google.maps.places.PlacesServiceStatus.OK && res ? res : [])
        );
      });
    Promise.all([search("cafe"), search("restaurant")]).then((lists) => {
      if (cancelled) return;
      const seen = new Map<string, NearbyPlace>();
      for (const p of lists.flat()) {
        if (p.place_id && p.name && !seen.has(p.place_id)) {
          seen.set(p.place_id, { id: p.place_id, name: p.name, rating: p.rating });
        }
      }
      setNearby(
        [...seen.values()]
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
          .slice(0, 3)
      );
    });
    return () => {
      cancelled = true;
    };
  }, [charger, mapsReady]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-stone-900">{charger.name}</h2>
          <p className="text-sm text-stone-500">{charger.operator}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close charger details"
          className="rounded-full bg-stone-100 px-2.5 py-1 text-sm font-medium text-stone-600 active:bg-stone-200"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
          {charger.powerKw} kW
        </span>
        {charger.connectorTypes.map((ct) => (
          <span key={ct} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700">
            {ct}
          </span>
        ))}
        {charger.verified && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
            ✓ Verified
          </span>
        )}
      </div>

      <p className="text-sm text-stone-600">{charger.address}</p>

      {stop && (
        <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
          <p className="font-semibold">Planned stop at {stop.atDistanceKm} km</p>
          <p className="mt-0.5">
            Arrive at {stop.arrivalBatteryPercent}% → charge to {stop.chargeToPercent}% (~
            {stop.estChargeMinutes} min)
          </p>
        </div>
      )}

      {mapsReady && nearby !== null && nearby.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Nearby while you charge
          </h3>
          <ul className="mt-1.5 divide-y divide-stone-100">
            {nearby.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="truncate text-stone-700">{p.name}</span>
                {p.rating !== undefined && (
                  <span className="ml-2 shrink-0 text-stone-500">★ {p.rating.toFixed(1)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
