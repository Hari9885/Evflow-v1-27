"use client";

import { useEffect, useState } from "react";
import { api, errorMessage, type TripRecord } from "@/lib/api";

// Collapsible past-trips list for the vehicle step. Native <details> — no
// open/close state to manage.
export default function TripHistory() {
  const [trips, setTrips] = useState<TripRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .trips()
      .then(setTrips)
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  return (
    <details className="rounded-xl border border-stone-200">
      <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-stone-700">
        Past trips{trips ? ` (${trips.length})` : ""}
      </summary>
      <div className="border-t border-stone-100 px-3 py-2">
        {error ? (
          <p className="py-1 text-sm text-red-600">{error}</p>
        ) : trips === null ? (
          <p className="py-1 text-sm text-stone-400">Loading…</p>
        ) : trips.length === 0 ? (
          <p className="py-1 text-sm text-stone-400">No past trips yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {trips.map((t) => (
              <li key={t.id} className="py-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-stone-900">
                    {t.originName || "?"} → {t.destName || "?"}
                  </span>
                  <span className="shrink-0 text-stone-500">
                    {t.completed && t.costInr !== undefined ? `₹${t.costInr}` : "in progress"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-stone-500">
                  {Math.round(t.distanceKm ?? t.plannedDistanceKm)} km ·{" "}
                  {new Date(t.startedAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
