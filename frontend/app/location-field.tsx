"use client";

import { useEffect, useState } from "react";
import { LatLng, LocationPicker } from "./location-picker";
import { LOCATION_CONSENT, LocateResult, locate } from "@/lib/location";

/**
 * Exact-location input shared by register, request and profile (#73):
 * the LocationPicker map, a /locate label ("Near Kilimani") with a coverage
 * check, a consent note, and (as children) the area dropdown fallback for
 * anyone who declines location access.
 */
export function LocationField({
  label,
  point,
  onPointChange,
  onLocated,
  fallbackLabel = "Or choose your area instead",
  children,
}: {
  label: string;
  point: LatLng | null;
  onPointChange: (p: LatLng) => void;
  onLocated: (r: LocateResult | null) => void;
  fallbackLabel?: string;
  children?: React.ReactNode;
}) {
  const [located, setLocated] = useState<LocateResult | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);

  useEffect(() => {
    if (!point) {
      setLocated(null);
      onLocated(null);
      return;
    }
    let cancelled = false;
    setLookupFailed(false);
    locate(point.lat, point.lng)
      .then((r) => {
        if (cancelled) return;
        setLocated(r);
        onLocated(r);
      })
      .catch(() => {
        if (cancelled) return;
        setLocated(null);
        onLocated(null);
        setLookupFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // onLocated is a parent setter; re-run only when the point moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.lat, point?.lng]);

  return (
    <fieldset className="space-y-3 rounded-lg border border-stone-200 p-4">
      <legend className="px-1 text-sm font-medium text-stone-700">{label}</legend>
      <LocationPicker value={point} onChange={onPointChange} />

      {located && located.covered && (
        <p className="text-sm text-teal-800" data-testid="location-area">
          Near <span className="font-semibold">{located.area_name}</span>
        </p>
      )}
      {located && !located.covered && (
        <p role="alert" className="text-sm text-red-600">
          That point is outside the area NaiServe covers (nearest: {located.area_name},{" "}
          {located.distance_km.toFixed(1)} km away). Move the pin, or choose an area below.
        </p>
      )}
      {lookupFailed && (
        <p role="alert" className="text-sm text-red-600">
          Couldn&apos;t check that location right now. Try again, or choose an area below.
        </p>
      )}
      <p className="text-xs text-stone-500">{LOCATION_CONSENT}</p>

      {children && (
        <div className="border-t border-stone-100 pt-3">
          <p className="mb-1 text-sm font-medium text-stone-700">{fallbackLabel}</p>
          {children}
        </div>
      )}
    </fieldset>
  );
}
