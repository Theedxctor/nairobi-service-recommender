// Shape returned by POST /recommend (mirrors RankedProvider in ml-service/api.py).
export interface RankedProvider {
  provider_id: string;
  name: string;
  reliability_score: number;
  estimated_travel_min: number;
  distance_km: number;
  hourly_rate_ksh: number;
  rating: number | null; // null until rated; imported ratings labelled separately
  review_count?: number; // optional for saved results from before reviews launched
  is_new?: boolean; // no job history yet: score uses the platform-median prior
  is_verified?: boolean; // optional for saved results from before filters (#79)
  explanation: string;
}

// Body sent to POST /recommend. Values must be the API's canonical ones
// (GET /time_slots, /day_types, /service_types), not display labels.
export interface RecommendRequest {
  client_area: string; // area name; derived from the exact point when one is sent
  client_lat?: number; // exact job location (#72/#73)
  client_lng?: number;
  service_type: string;
  time_slot: string;
  day_type: string; // derived from job_date when one is sent
  job_date?: string; // "YYYY-MM-DD" (#82); absent on searches saved before dates
  top_n: number;
  // Optional filters (#79). The API applies them before the top_n cut.
  max_hourly_rate_ksh?: number;
  min_rating?: number;
  verified_only?: boolean;
}

export interface RecommendationResult {
  request: RecommendRequest;
  providers: RankedProvider[];
  // "New on NaiServe": no-history providers outside the top N (#61)
  newProviders?: RankedProvider[];
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

export function ratingLabel(rating: number | null, reviewCount = 0): string {
  if (rating === null) return "Not yet rated";
  const source = reviewCount > 0
    ? `${reviewCount} NaiServe review${reviewCount === 1 ? "" : "s"}`
    : "Imported dataset rating";
  return `★ ${rating.toFixed(1)} · ${source}`;
}

// Job dates (#82) are plain calendar dates ("2026-10-13"). They are built and
// parsed as local dates, never via UTC, so the weekday cannot shift by a day.
export const JOB_DATE_MAX_DAYS_AHEAD = 60; // matches ml-service/api.py

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseJobDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toIsoDate(d) === iso ? d : null; // rejects e.g. 2026-02-30
}

export function dayNameOf(iso: string): string | null {
  const d = parseJobDate(iso);
  return d ? DAY_NAMES[d.getDay()] : null;
}

export function dayTypeOf(iso: string): "weekday" | "weekend" | null {
  const d = parseJobDate(iso);
  if (!d) return null;
  return d.getDay() === 0 || d.getDay() === 6 ? "weekend" : "weekday";
}

/** "Tue 13 Oct 2026" - the same form the API uses in notifications. */
export function formatJobDate(iso: string): string {
  const d = parseJobDate(iso);
  if (!d) return iso;
  return `${DAY_NAMES[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** The job's date, or its day type for requests and bookings that have no date. */
export function whenLabel(item: { job_date?: string | null; day_type: string }): string {
  return item.job_date ? formatJobDate(item.job_date) : capitalize(item.day_type);
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
  job_date?: string | null; // null for bookings made before dates were collected (#82)
  // The open request to move this booking (#83), or null. The booking's own
  // date and slot only change once the other party accepts it.
  reschedule?: { proposed_by: "client" | "provider"; job_date: string; time_slot: string; created_at: string } | null;
  reliability_score: number | null;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  // Set when cancelled (#81); null for bookings cancelled before this was recorded.
  cancelled_by?: "client" | "provider" | null;
  cancellation_reason?: string | null;
  created_at: string;
  review?: {
    rating: number;
    comment: string | null;
    created_at: string;
  } | null;
}
