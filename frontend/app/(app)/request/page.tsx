"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readAuth, useAuthGuard } from "../../use-auth-guard";
import { LocationField } from "../../location-field";
import type { LatLng } from "../../location-picker";
import type { LocateResult } from "@/lib/location";
import { API_BASE_URL, NETWORK_ERROR_MESSAGE, apiErrorMessage } from "@/lib/api";
import {
  RankedProvider,
  RecommendRequest,
  TIME_SLOT_LABELS,
  capitalize,
  saveRecommendation,
} from "@/lib/recommendation";

export default function RequestPage() {
  const { checked } = useAuthGuard(["client"]);
  const router = useRouter();
  const [areas, setAreas] = useState<string[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState("plumber");
  const [clientArea, setClientArea] = useState("Kilimani");
  // Where the job is (#73): the saved home location, another exact point,
  // or a named area (fallback; also the default for accounts with no saved point).
  const [home, setHome] = useState<{ lat: number; lng: number; area: string } | null>(null);
  const [locationMode, setLocationMode] = useState<"home" | "point" | "area">("area");
  const [point, setPoint] = useState<LatLng | null>(null);
  const [pointArea, setPointArea] = useState<LocateResult | null>(null);
  const [dayType, setDayType] = useState("weekday");
  const [timeSlot, setTimeSlot] = useState("morning_rush");
  const [optionsState, setOptionsState] = useState<"loading" | "ready" | "failed">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Options come from the API so the form can only send values the model
  // was trained on (free text silently produced wrong scores — see #42).
  const loadOptions = useCallback(() => {
    setOptionsState("loading");
    const getList = (path: string) =>
      fetch(`${API_BASE_URL}${path}`).then((r) => {
        if (!r.ok) throw new Error(path);
        return r.json() as Promise<string[]>;
      });
    Promise.all([getList("/areas"), getList("/service_types")])
      .then(([areaList, typeList]) => {
        setAreas(areaList);
        setServiceTypes(typeList);
        setOptionsState("ready");
      })
      .catch(() => setOptionsState("failed"));
  }, []);

  useEffect(loadOptions, [loadOptions]);

  // Saved home location from the profile, if the client shared one.
  useEffect(() => {
    const auth = readAuth();
    if (!auth?.user_id) return;
    fetch(`${API_BASE_URL}/profile?user_id=${encodeURIComponent(auth.user_id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (p && typeof p.lat === "number" && typeof p.lng === "number") {
          setHome({ lat: p.lat, lng: p.lng, area: p.area_name ?? "" });
          setLocationMode("home");
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    let where: Pick<RecommendRequest, "client_area" | "client_lat" | "client_lng"> = { client_area: clientArea };
    if (locationMode === "home" && home) {
      where = { client_area: home.area, client_lat: home.lat, client_lng: home.lng };
    } else if (locationMode === "point") {
      if (!point || !pointArea?.covered) {
        setError("Set a location inside the area NaiServe covers, or choose an area.");
        setSubmitting(false);
        return;
      }
      where = { client_area: pointArea.area_name, client_lat: point.lat, client_lng: point.lng };
    }
    const body: RecommendRequest = {
      ...where,
      service_type: serviceType,
      time_slot: timeSlot,
      day_type: dayType,
      top_n: 10,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 404) {
        // No provider of this type, or none available at this day/time.
        setError(
          `No ${serviceType} is available in that slot. Try a different time slot or day.`
        );
        return;
      }
      if (!res.ok) {
        setError(apiErrorMessage(data));
        return;
      }
      // The "New on NaiServe" section is loaded by /results after the main
      // list is on screen, so it never delays the results (#70).
      saveRecommendation({ request: body, providers: data as RankedProvider[] });
      router.push("/results");
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  };

  if (!checked) return null;

  return (
    <div className="max-w-2xl space-y-8">
      {/* 3-Step Progress Indicator */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
        <div className="flex items-center justify-between relative">
          {/* Connecting line */}
          <div className="absolute left-6 right-6 top-1/2 -transtone-y-1/2 h-0.5 bg-stone-200 -z-0" />

          {/* Step 1: Active */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-semibold text-sm shadow-sm">
              1
            </span>
            <span className="text-sm font-semibold text-teal-600">
              Request Details
            </span>
          </div>

          {/* Step 2: Inactive */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-stone-100 text-stone-500 border border-stone-200 flex items-center justify-center font-semibold text-sm">
              2
            </span>
            <span className="text-sm font-medium text-stone-400">
              View Recommendations
            </span>
          </div>

          {/* Step 3: Inactive */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-stone-100 text-stone-500 border border-stone-200 flex items-center justify-center font-semibold text-sm">
              3
            </span>
            <span className="text-sm font-medium text-stone-400">
              Confirm Booking
            </span>
          </div>
        </div>
      </div>

      {/* Service Request Form */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6 sm:p-8">
        <div className="mb-6 pb-4 border-b border-stone-100">
          <h1 className="font-heading text-2xl font-bold text-stone-900">
            Request a Household Service
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Specify your location and timing to find the most reliable available
            providers in Nairobi.
          </p>
        </div>

        {optionsState === "failed" && (
          <div
            role="alert"
            className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <span>{NETWORK_ERROR_MESSAGE}</span>
            <button
              type="button"
              onClick={loadOptions}
              className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" aria-busy={optionsState === "loading"}>
          {/* Service Type */}
          <div>
            <label
              htmlFor="serviceType"
              className="block text-sm font-medium text-stone-700 mb-1"
            >
              Service Type
            </label>
            <select
              id="serviceType"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 bg-white text-stone-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
            >
              {serviceTypes.map((type) => (
                <option key={type} value={type}>
                  {capitalize(type)}
                </option>
              ))}
            </select>
          </div>

          {/* Where is the job? (#73) */}
          <fieldset className="space-y-2">
            <legend className="block text-sm font-medium text-stone-700 mb-1">Where is the job?</legend>
            {home && (
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="radio"
                  name="locationMode"
                  checked={locationMode === "home"}
                  onChange={() => setLocationMode("home")}
                  className="accent-teal-700"
                />
                My saved home location{home.area ? ` (near ${home.area})` : ""}
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="radio"
                name="locationMode"
                checked={locationMode === "point"}
                onChange={() => setLocationMode("point")}
                className="accent-teal-700"
              />
              My current location or another spot
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="radio"
                name="locationMode"
                checked={locationMode === "area"}
                onChange={() => setLocationMode("area")}
                className="accent-teal-700"
              />
              Choose an area
            </label>
          </fieldset>

          {locationMode === "point" && (
            <LocationField
              label="Job location"
              point={point}
              onPointChange={setPoint}
              onLocated={setPointArea}
            />
          )}

          {/* Client Area (fallback) */}
          <div className={locationMode === "area" ? "" : "hidden"}>
            <label
              htmlFor="clientArea"
              className="block text-sm font-medium text-stone-700 mb-1"
            >
              Area
            </label>
            <select
              id="clientArea"
              value={clientArea}
              onChange={(e) => setClientArea(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 bg-white text-stone-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
            >
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          {/* Preferred Day */}
          <fieldset>
            <legend className="block text-sm font-medium text-stone-700 mb-2">
              Preferred Day
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <label
                className={`relative flex items-center justify-center p-3 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                  dayType === "weekday"
                    ? "border-teal-600 bg-teal-50 text-teal-700 ring-1 ring-teal-600"
                    : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                <input
                  type="radio"
                  name="dayType"
                  value="weekday"
                  checked={dayType === "weekday"}
                  onChange={() => setDayType("weekday")}
                  className="peer sr-only"
                />
                <span className="peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-600 rounded">
                  Weekday (Mon - Fri)
                </span>
              </label>

              <label
                className={`relative flex items-center justify-center p-3 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                  dayType === "weekend"
                    ? "border-teal-600 bg-teal-50 text-teal-700 ring-1 ring-teal-600"
                    : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                <input
                  type="radio"
                  name="dayType"
                  value="weekend"
                  checked={dayType === "weekend"}
                  onChange={() => setDayType("weekend")}
                  className="peer sr-only"
                />
                <span className="peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-600 rounded">
                  Weekend (Sat - Sun)
                </span>
              </label>
            </div>
          </fieldset>


          {/* Preferred Time Slot */}
          <div>
            <label
              htmlFor="timeSlot"
              className="block text-sm font-medium text-stone-700 mb-1"
            >
              Preferred Time Slot
            </label>
            <select
              id="timeSlot"
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 bg-white text-stone-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
            >
              {Object.entries(TIME_SLOT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || optionsState !== "ready"}
              className="w-full inline-flex items-center justify-center py-3 px-4 rounded-lg text-white font-medium bg-teal-700 hover:bg-teal-800 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 shadow-sm transition-colors"
            >
              {optionsState === "loading"
                ? "Loading options..."
                : submitting
                ? "Finding providers..."
                : "Find Providers"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
