export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const NETWORK_ERROR_MESSAGE =
  "Could not reach the recommendation service. Check your connection and try again.";

// FastAPI returns `detail` as a string for HTTPException, but as an array of
// {loc, msg} objects for request validation (422). Turn either into one line.
export function apiErrorMessage(data: unknown): string {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { msg?: string }) => d.msg?.replace(/^Value error, /, ""))
      .filter(Boolean)
      .join("; ");
  }
  return "Something went wrong. Please try again.";
}
