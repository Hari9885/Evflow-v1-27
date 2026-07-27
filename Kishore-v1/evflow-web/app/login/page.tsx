"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage, isBike, type Vehicle } from "@/lib/api";
import { loadProfile, saveProfile } from "@/lib/profile";

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-blue-400 focus:outline-none";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tab, setTab] = useState<"car" | "bike">("car");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [battery, setBattery] = useState(90);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reads localStorage (unavailable during SSR), so it has to run after
    // mount rather than as a lazy useState initializer.
    /* eslint-disable react-hooks/set-state-in-effect */
    const existing = loadProfile();
    if (existing) {
      setName(existing.name);
      setTab(existing.vehicleType);
      setVehicleId(existing.vehicleId);
      setBattery(existing.startBatteryPercent);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    api.vehicles().then(setVehicles).catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  const shown = vehicles.filter((v) => (tab === "bike" ? isBike(v) : !isBike(v)));

  function submit() {
    if (!name.trim() || !vehicleId) return;
    saveProfile({ name: name.trim(), vehicleId, vehicleType: tab, startBatteryPercent: battery });
    router.push("/");
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-white p-5 shadow-xl">
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-blue-700">EVFLOW</h1>
      <p className="mt-1 text-sm text-stone-500">Tell us about your ride.</p>

      <div className="mt-6">
        <label className="mb-1 block text-xs font-medium text-stone-500">Your name</label>
        <input
          className={inputClass}
          placeholder="e.g. Hari"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="mt-5 flex shrink-0 rounded-xl bg-stone-100 p-1">
        {(["car", "bike"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setVehicleId(null);
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize ${
              tab === t ? "bg-white text-blue-700 shadow" : "text-stone-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {error && <p className="py-2 text-sm text-red-600">{error}</p>}
        {vehicles.length === 0 && !error && (
          <p className="py-4 text-center text-sm text-stone-400">Loading vehicles…</p>
        )}
        {vehicles.length > 0 && shown.length === 0 && (
          <p className="py-4 text-center text-sm text-stone-400">No {tab}s yet.</p>
        )}
        <div className="flex flex-col gap-2">
          {shown.map((v) => (
            <button
              key={v.id}
              onClick={() => setVehicleId(v.id)}
              className={`rounded-xl border p-3 text-left ${
                vehicleId === v.id
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
      </div>

      <div className="mt-3 shrink-0">
        <label className="mb-1 flex justify-between text-xs font-medium text-stone-500">
          <span>Current battery</span>
          <span className="font-semibold text-stone-900">{battery}%</span>
        </label>
        <input
          type="range"
          min={10}
          max={100}
          value={battery}
          onChange={(e) => setBattery(Number(e.target.value))}
          className="w-full accent-blue-700"
        />
      </div>

      <button
        disabled={!name.trim() || !vehicleId}
        onClick={submit}
        className="mt-4 w-full shrink-0 rounded-xl bg-blue-700 py-3 text-sm font-semibold text-white active:bg-blue-800 disabled:bg-stone-300"
      >
        Continue
      </button>
    </main>
  );
}
