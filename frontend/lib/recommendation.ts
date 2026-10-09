// Shape returned by POST /recommend (mirrors RankedProvider in ml-service/api.py).
export interface RankedProvider {
  provider_id: string;
  name: string;
  reliability_score: number;
  estimated_travel_min: number;
  distance_km: number;
  hourly_rate_ksh: number;
  rating: number | null; // null for new providers with no completed jobs
  explanation: string;
}

// Body sent to POST /recommend. Values must be the API's canonical ones
// (GET /time_slots, /day_types, /service_types), not display labels.
export interface RecommendRequest {
  client_area: string;
  service_type: string;
  time_slot: string;
  day_type: string;
  top_n: number;
}

export interface RecommendationResult {
  request: RecommendRequest;
  providers: RankedProvider[];
}

// Display labels for the API's canonical time_slot values.
export const TIME_SLOT_LABELS: Record<string, string> = {
  morning_rush: "Morning Rush (07:00 - 09:00)",
  midday: "Midday (11:00 - 14:00)",
  evening_rush: "Evening Rush (16:00 - 19:00)",
  weekend_day: "Weekend Day (Daytime)",
};

// The /request page hands its result to /results through sessionStorage, so
// a refresh of /results keeps the same list without re-running the model.
const STORAGE_KEY = "naiserve_last_recommendation";

export function saveRecommendation(result: RecommendationResult) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
}

export function readRecommendation(): RecommendationResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecommendationResult) : null;
  } catch {
    return null;
  }
}

export function ratingLabel(rating: number | null): string {
  return rating === null ? "New" : `★ ${rating.toFixed(1)}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Shape returned by POST/GET /bookings (mirrors BookingResponse in api.py).
export interface Booking {
  booking_id: number;
  client_id: string;
  client_name: string | null;
  provider_id: string;
  provider_name: string | null;
  provider_hourly_rate_ksh: number | null;
  service_type: string;
  client_area: string;
  time_slot: string;
  day_type: string;
  reliability_score: number | null;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  created_at: string;
}
