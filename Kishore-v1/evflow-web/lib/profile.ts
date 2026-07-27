// Local-only "login": no backend auth exists in the contract, so the
// user's basic details + vehicle choice just live in the browser.

export type Profile = {
  name: string;
  vehicleId: string;
  vehicleType: "car" | "bike";
  startBatteryPercent: number;
};

const KEY = "evflow.profile";

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  window.localStorage.setItem(KEY, JSON.stringify(p));
}
