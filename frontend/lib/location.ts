import { API_BASE_URL } from "@/lib/api";

// GET /locate: nearest named area for an exact point, and whether NaiServe
// covers it (the API rejects points >8 km from every covered area).
export interface LocateResult {
  area_id: string;
  area_name: string;
  distance_km: number;
  covered: boolean;
}

export async function locate(lat: number, lng: number): Promise<LocateResult> {
  const res = await fetch(`${API_BASE_URL}/locate?lat=${lat}&lng=${lng}`);
  if (!res.ok) throw new Error(`locate failed: ${res.status}`);
  return res.json();
}

export const LOCATION_CONSENT =
  "We use this location only to measure travel distance to providers. It is saved with your " +
  "account, and you can change it on your profile at any time.";
