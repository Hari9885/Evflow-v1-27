"use client";

import { useRef, useState } from "react";
import { Autocomplete } from "@react-google-maps/api";
import type {
  Charger,
  RoutePlan,
  Trip,
  TripSummary,
  Vehicle,
} from "@/lib/api";
import type { AssistantSnapshot } from "@/lib/assistant-tools";
import BatteryCurve from "@/components/BatteryCurve";
import ChargerDetail from "@/components/ChargerDetail";
import TripHistory from "@/components/TripHistory";

export type Place = { name: string; lat: number; lng: number };

// The single top-level state object. The Day-4 assistant gets read access to
// this whole thing — keep everything it needs to answer questions in here.
export type PlannerState = {
  step: "vehicle" | "route" | "result";
  vehicles: Vehicle[];
  vehicleId: string | null;
  startBatteryPercent: number;
  origin: Place | null;
  dest: Place | null;
  directions: google.maps.DirectionsResult | null;
  plan: RoutePlan | null;
  chargers: Charger[];
  selectedCharger: Charger | null;
  trip: Trip | null;
  summary: TripSummary | null;
  busy: "planning" | "starting" | "completing" | null;
  error: string | null;
};

const KARNATAKA_BOUNDS = { south: 11.5, west: 74.0, north: 18.5, east: 78.6 };
const DEMO = {
  origin: { name: "Bengaluru", lat: 12.9716, lng: 77.5946 },
  dest: { name: "Mysuru", lat: 12.3052, lng: 76.6552 },
};

type Props = {
  state: PlannerState;
  hasKey: boolean;
  isLoaded: boolean;
  onPatch: (p: Partial<PlannerState>) => void;
  onPlan: () => void;
  onStartTrip: () => void;
  onCompleteTrip: () => void;
  onReset: () => void;
  onRetryVehicles: () => void;
};

function PlaceInput({
  label,
  placeholder,
  ready,
  value,
  onSelect,
}: {
  label: string;
  placeholder: string;
  ready: boolean;
  value: Place | null;
  onSelect: (p: Place) => void;
}) {
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);
  const inputClass =
    "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-blue-400 focus:outline-none disabled:opacity-60";
  const input = (
    <input
      className={inputClass}
      placeholder={ready ? placeholder : "Maps key required for place search"}
      defaultValue={value?.name ?? ""}
      disabled={!ready}
    />
  );
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-500">{label}</label>
      {ready ? (
        <Autocomplete
          onLoad={(ac) => {
            acRef.current = ac;
          }}
          onPlaceChanged={() => {
            const p = acRef.current?.getPlace();
            const loc = p?.geometry?.location;
            if (loc) {
              onSelect({
                name: p?.name || p?.formatted_address || "Selected place",
                lat: loc.lat(),
                lng: loc.lng(),
              });
            }
          }}
          options={{
            bounds: KARNATAKA_BOUNDS,
            componentRestrictions: { country: "in" },
            fields: ["name", "formatted_address", "geometry.location"],
          }}
        >
          {input}
        </Autocomplete>
      ) : (
        input
      )}
    </div>
  );
}

const primaryBtn =
  "w-full rounded-xl bg-blue-700 py-3 text-sm font-semibold text-white active:bg-blue-800 disabled:bg-stone-300";

export default function PlannerSheet({
  state,
  hasKey,
  isLoaded,
  onPatch,
  onPlan,
  onStartTrip,
  onCompleteTrip,
  onReset,
  onRetryVehicles,
}: Props) {
  const s = state;
  const vehicle = s.vehicles.find((v) => v.id === s.vehicleId) ?? null;
  const selectedStop =
    s.selectedCharger && s.plan
      ? s.plan.chargingStops.find((st) => st.charger.id === s.selectedCharger!.id) ?? null
      : null;

  return (
    <section className="relative z-10 -mt-4 flex min-h-0 flex-1 flex-col rounded-t-2xl bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.10)]">
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-stone-200" aria-hidden />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {s.error && (
          <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {s.error}
          </div>
        )}

        {s.selectedCharger ? (
          <ChargerDetail
            key={s.selectedCharger.id}
            charger={s.selectedCharger}
            stop={selectedStop}
            mapsReady={isLoaded}
            onClose={() => onPatch({ selectedCharger: null })}
          />
        ) : s.step === "vehicle" ? (
          <VehicleStep s={s} onPatch={onPatch} onRetryVehicles={onRetryVehicles} />
        ) : s.step === "route" ? (
          <RouteStep s={s} hasKey={hasKey} isLoaded={isLoaded} onPatch={onPatch} onPlan={onPlan} />
        ) : (
          <ResultStep
            s={s}
            vehicle={vehicle}
            onPatch={onPatch}
            onStartTrip={onStartTrip}
            onCompleteTrip={onCompleteTrip}
            onReset={onReset}
          />
        )}
      </div>

      <AssistantBar s={s} />
    </section>
  );
}

type ChatMsg = { role: "user" | "assistant"; content: string };

// Mini chat pinned to the bottom of the sheet. Talks to /api/assistant (a
// same-origin Next route, not the EVFLOW backend — hence not in lib/api.ts)
// and sends a read-only snapshot of PlannerState with every message.
function AssistantBar({ s }: { s: PlannerState }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [noKey, setNoKey] = useState(false);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    const history = messages;
    setInput("");
    setError(null);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: message }]);

    const snapshot: AssistantSnapshot = {
      vehicle: s.vehicles.find((v) => v.id === s.vehicleId) ?? null,
      startBatteryPercent: s.startBatteryPercent,
      origin: s.origin,
      dest: s.dest,
      plan: s.plan,
      selectedCharger: s.selectedCharger
        ? { name: s.selectedCharger.name, lat: s.selectedCharger.lat, lng: s.selectedCharger.lng }
        : null,
      tripStatus: s.summary ? "completed" : s.trip ? "in_progress" : "not_started",
    };

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, snapshot }),
      });
      const data: { configured?: boolean; reply?: string; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || `Assistant failed (${res.status})`);
      if (data.configured === false) {
        setNoKey(true);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assistant failed");
    } finally {
      setBusy(false);
    }
  }

  const visible = expanded ? messages : messages.slice(-2);
  const showLog = messages.length > 0 || busy || error || noKey;

  return (
    <div className="shrink-0 border-t border-stone-100 p-3">
      {showLog && (
        <div
          className={`mb-2 flex flex-col gap-1.5 overflow-y-auto ${
            expanded ? "max-h-52" : "max-h-28"
          }`}
        >
          {messages.length > 2 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="self-center text-[11px] font-medium text-blue-700"
            >
              {expanded ? "Show less" : `Show all ${messages.length} messages`}
            </button>
          )}
          {visible.map((m, i) => (
            <p
              key={i}
              className={
                m.role === "user"
                  ? "max-w-[85%] self-end rounded-2xl rounded-br-sm bg-blue-700 px-3 py-1.5 text-sm text-white"
                  : "max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-1.5 text-sm text-stone-800"
              }
            >
              {m.content}
            </p>
          ))}
          {busy && (
            <span
              className="inline-flex gap-1 self-start rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-2.5"
              aria-label="Assistant is thinking"
            >
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </span>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {noKey && (
            <p className="text-xs text-stone-400">
              Assistant offline — add ANTHROPIC_API_KEY to .env.local and restart.
            </p>
          )}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about battery, route or chargers"
          className="min-w-0 flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-blue-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-full bg-blue-700 px-4 text-sm font-semibold text-white active:bg-blue-800 disabled:bg-stone-300"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function VehicleStep({
  s,
  onPatch,
  onRetryVehicles,
}: {
  s: PlannerState;
  onPatch: Props["onPatch"];
  onRetryVehicles: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-base font-semibold text-stone-900">Choose your EV</h1>

      {s.vehicles.length === 0 ? (
        <div className="rounded-xl bg-stone-50 p-4 text-center text-sm text-stone-500">
          <p>Loading vehicles… (is the API running?)</p>
          <button
            onClick={onRetryVehicles}
            className="mt-2 rounded-lg bg-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 active:bg-stone-300"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {s.vehicles.map((v) => (
            <button
              key={v.id}
              onClick={() => onPatch({ vehicleId: v.id })}
              className={`rounded-xl border p-3 text-left ${
                s.vehicleId === v.id
                  ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600"
                  : "border-stone-200 bg-white active:bg-stone-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-stone-900">{v.name}</span>
                <span className="text-xs text-stone-500">{v.batteryKwh} kWh</span>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                {v.connectorType} · up to {v.maxChargeKw} kW · {v.baseWhPerKm} Wh/km
              </p>
            </button>
          ))}
        </div>
      )}

      <div>
        <label htmlFor="battery" className="mb-1 flex justify-between text-xs font-medium text-stone-500">
          <span>Current battery</span>
          <span className="font-semibold text-stone-900">{s.startBatteryPercent}%</span>
        </label>
        <input
          id="battery"
          type="range"
          min={10}
          max={100}
          value={s.startBatteryPercent}
          onChange={(e) => onPatch({ startBatteryPercent: Number(e.target.value) })}
          className="w-full accent-blue-700"
        />
      </div>

      <button
        className={primaryBtn}
        disabled={!s.vehicleId}
        onClick={() => onPatch({ step: "route", error: null })}
      >
        Continue
      </button>

      <TripHistory />
    </div>
  );
}

function RouteStep({
  s,
  hasKey,
  isLoaded,
  onPatch,
  onPlan,
}: {
  s: PlannerState;
  hasKey: boolean;
  isLoaded: boolean;
  onPatch: Props["onPatch"];
  onPlan: () => void;
}) {
  const ready = hasKey && isLoaded;
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-stone-900">Where to?</h1>
        <button
          onClick={() => onPatch({ step: "vehicle" })}
          className="text-xs font-medium text-blue-700"
        >
          ← Vehicle
        </button>
      </div>

      <PlaceInput
        label="Origin"
        placeholder="e.g. Bengaluru"
        ready={ready}
        value={s.origin}
        onSelect={(origin) => onPatch({ origin })}
      />
      <PlaceInput
        label="Destination"
        placeholder="e.g. Mysuru"
        ready={ready}
        value={s.dest}
        onSelect={(dest) => onPatch({ dest })}
      />

      {ready && (
        <button
          onClick={() => onPatch({ ...DEMO })}
          className="self-start text-xs font-medium text-blue-700"
        >
          Use demo route: Bengaluru → Mysuru
        </button>
      )}

      <button
        className={primaryBtn}
        disabled={!ready || !s.origin || !s.dest || s.busy === "planning"}
        onClick={onPlan}
      >
        {s.busy === "planning" ? "Planning…" : "Plan trip"}
      </button>
      {!hasKey && (
        <p className="text-xs text-stone-400">
          Planning needs the Google Maps key — see the card in the map area.
        </p>
      )}
    </div>
  );
}

function ResultStep({
  s,
  vehicle,
  onPatch,
  onStartTrip,
  onCompleteTrip,
  onReset,
}: {
  s: PlannerState;
  vehicle: Vehicle | null;
  onPatch: Props["onPatch"];
  onStartTrip: () => void;
  onCompleteTrip: () => void;
  onReset: () => void;
}) {
  const plan = s.plan;
  if (!plan) return null;
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-stone-900">
          {s.origin?.name} → {s.dest?.name}
        </h1>
        {!s.trip && (
          <button
            onClick={() => onPatch({ step: "route", error: null })}
            className="text-xs font-medium text-blue-700"
          >
            Edit
          </button>
        )}
      </div>

      {!plan.feasible && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No compatible charger found — this route is not feasible with{" "}
          {vehicle ? vehicle.name : "this vehicle"} from {s.startBatteryPercent}%.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Distance" value={`${Math.round(plan.totalDistanceKm)} km`} />
        <Stat label="Energy" value={`${plan.totalEnergyKwh.toFixed(1)} kWh`} />
        <Stat label="Stops" value={String(plan.chargingStops.length)} />
      </div>

      <div>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
          Battery along the route
        </h2>
        <BatteryCurve plan={plan} />
      </div>

      {plan.chargingStops.length > 0 && (
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
            Charging stops
          </h2>
          <ul className="flex flex-col gap-2">
            {plan.chargingStops.map((stop, i) => (
              <li key={stop.charger.id}>
                <button
                  onClick={() => onPatch({ selectedCharger: stop.charger })}
                  className="flex w-full items-center gap-3 rounded-xl border border-stone-200 p-3 text-left active:bg-stone-50"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-900">
                      {stop.charger.name}
                    </span>
                    <span className="block text-xs text-stone-500">
                      at {Math.round(stop.atDistanceKm)} km · arrive{" "}
                      {stop.arrivalBatteryPercent}% → {stop.chargeToPercent}% · ~
                      {stop.estChargeMinutes} min
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.summary ? (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h2 className="text-sm font-semibold text-emerald-900">Trip complete</h2>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <SummaryRow label="Distance" value={`${s.summary.distanceKm} km`} />
              <SummaryRow label="Energy" value={`${s.summary.energyKwh} kWh`} />
              <SummaryRow label="Cost" value={`₹${s.summary.costInr}`} />
              <SummaryRow label="Duration" value={`${s.summary.durationMin} min`} />
              <SummaryRow label="Efficiency" value={`${s.summary.avgWhPerKm} Wh/km`} />
            </dl>
          </div>
          <button className={primaryBtn} onClick={onReset}>
            Plan another trip
          </button>
        </>
      ) : s.trip ? (
        <button className={primaryBtn} disabled={s.busy === "completing"} onClick={onCompleteTrip}>
          {s.busy === "completing" ? "Completing…" : "Complete trip"}
        </button>
      ) : (
        <button
          className={primaryBtn}
          disabled={!plan.feasible || s.busy === "starting"}
          onClick={onStartTrip}
        >
          {s.busy === "starting" ? "Starting…" : "Start trip"}
        </button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 py-2">
      <p className="text-sm font-semibold text-stone-900">{value}</p>
      <p className="text-[11px] text-stone-500">{label}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-emerald-800">{label}</dt>
      <dd className="font-semibold text-emerald-900">{value}</dd>
    </div>
  );
}
