"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "../../use-auth-guard";
import { API_BASE_URL } from "@/lib/api";
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
  const [dayType, setDayType] = useState("weekday");
  const [timeSlot, setTimeSlot] = useState("morning_rush");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Options come from the API so the form can only send values the model
  // was trained on (free text silently produced wrong scores — see #42).
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/areas`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/service_types`).then((r) => r.json()),
    ])
      .then(([areaList, typeList]: [string[], string[]]) => {
        setAreas(areaList);
        setServiceTypes(typeList);
      })
      .catch(() =>
        setError("Could not reach the recommendation service. Is the backend running?")
      );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const body: RecommendRequest = {
      client_area: clientArea,
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
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? "Something went wrong. Please try again.");
        return;
      }
      saveRecommendation({ request: body, providers: data as RankedProvider[] });
      router.push("/results");
    } catch {
      setError("Could not reach the recommendation service. Is the backend running?");
    } finally {
      setSubmitting(false);
    }
  };

  if (!checked) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-8 px-4 py-8">
      {/* 3-Step Progress Indicator */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between relative">
          {/* Connecting line */}
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 -z-0" />

          {/* Step 1: Active */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-sm shadow-sm">
              1
            </span>
            <span className="text-sm font-semibold text-indigo-600">
              Request Details
            </span>
          </div>

          {/* Step 2: Inactive */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 border border-slate-200 flex items-center justify-center font-semibold text-sm">
              2
            </span>
            <span className="text-sm font-medium text-slate-400">
              View Recommendations
            </span>
          </div>

          {/* Step 3: Inactive */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 border border-slate-200 flex items-center justify-center font-semibold text-sm">
              3
            </span>
            <span className="text-sm font-medium text-slate-400">
              Confirm Booking
            </span>
          </div>
        </div>
      </div>

      {/* Service Request Form */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="mb-6 pb-4 border-b border-slate-100">
          <h1 className="text-2xl font-bold text-slate-900">
            Request a Household Service
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Specify your location and timing to find the most reliable available
            providers in Nairobi.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Service Type */}
          <div>
            <label
              htmlFor="serviceType"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Service Type
            </label>
            <select
              id="serviceType"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            >
              {serviceTypes.map((type) => (
                <option key={type} value={type}>
                  {capitalize(type)}
                </option>
              ))}
            </select>
          </div>

          {/* Client Area */}
          <div>
            <label
              htmlFor="clientArea"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Client Area
            </label>
            <select
              id="clientArea"
              value={clientArea}
              onChange={(e) => setClientArea(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
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
            <legend className="block text-sm font-medium text-slate-700 mb-2">
              Preferred Day
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <label
                className={`relative flex items-center justify-center p-3 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                  dayType === "weekday"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
                <span className="peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600 rounded">
                  Weekday (Mon - Fri)
                </span>
              </label>

              <label
                className={`relative flex items-center justify-center p-3 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                  dayType === "weekend"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
                <span className="peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600 rounded">
                  Weekend (Sat - Sun)
                </span>
              </label>
            </div>
          </fieldset>


          {/* Preferred Time Slot */}
          <div>
            <label
              htmlFor="timeSlot"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Preferred Time Slot
            </label>
            <select
              id="timeSlot"
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
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
              disabled={submitting || areas.length === 0}
              className="w-full inline-flex items-center justify-center py-3 px-4 rounded-lg text-white font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm transition-colors"
            >
              {submitting ? "Finding providers..." : "Find Providers"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
