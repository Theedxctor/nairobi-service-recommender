"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuthGuard } from "../../use-auth-guard";
import {
  RecommendationResult,
  TIME_SLOT_LABELS,
  capitalize,
  ratingLabel,
  readRecommendation,
} from "@/lib/recommendation";

type SortKey = "reliability" | "distance" | "price" | "rating";

export default function ResultsPage() {
  const { checked } = useAuthGuard(["client"]);
  const [sortBy, setSortBy] = useState<SortKey>("reliability");
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Written by /request after a successful POST /recommend.
  useEffect(() => {
    setResult(readRecommendation());
    setLoaded(true);
  }, []);

  const sortedProviders = useMemo(() => {
    const list = [...(result?.providers ?? [])];
    switch (sortBy) {
      case "reliability":
        return list.sort((a, b) => b.reliability_score - a.reliability_score);
      case "distance":
        return list.sort((a, b) => a.distance_km - b.distance_km);
      case "price":
        return list.sort((a, b) => a.hourly_rate_ksh - b.hourly_rate_ksh);
      case "rating":
        // Unrated (new) providers sort last rather than as 0 or NaN.
        return list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
      default:
        return list;
    }
  }, [sortBy, result]);

  if (!checked || !loaded) return null;

  if (!result) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-heading text-xl font-bold text-stone-900">No recommendations yet</h1>
        <p className="text-sm text-stone-500">
          Tell us what you need and when, and we&apos;ll rank available providers
          by predicted arrival reliability.
        </p>
        <Link
          href="/request"
          className="inline-flex px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold"
        >
          Start a request
        </Link>
      </div>
    );
  }

  const { request } = result;

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-4 py-8">
      {/* 3-Step Progress Indicator */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-6 right-6 top-1/2 -transtone-y-1/2 h-0.5 bg-stone-200 -z-0" />

          {/* Step 1: Completed */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-teal-700 text-white flex items-center justify-center font-semibold text-sm">
              ✓
            </span>
            <span className="text-sm font-medium text-stone-600">
              Request Details
            </span>
          </div>

          {/* Step 2: Active */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-semibold text-sm shadow-sm">
              2
            </span>
            <span className="text-sm font-semibold text-teal-600">
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

      {/* Header and Sorting Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-stone-200 shadow-sm">
        <div>
          <h1 className="font-heading text-xl font-bold text-stone-900">
            Recommended Providers
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            {capitalize(request.service_type)} in {request.client_area} ·{" "}
            {TIME_SLOT_LABELS[request.time_slot] ?? request.time_slot} ·{" "}
            {capitalize(request.day_type)}
          </p>
          <p className="text-xs text-stone-500 mt-0.5">
            Ranked by context-aware arrival reliability and location factors
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="sortSelect" className="text-xs font-medium text-stone-600 whitespace-nowrap">
            Sort by:
          </label>
          <select
            id="sortSelect"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-800 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="reliability">Reliability Score (High to Low)</option>
            <option value="distance">Distance (Nearest First)</option>
            <option value="price">Price (Lowest First)</option>
            <option value="rating">Rating (Highest First)</option>
          </select>
        </div>
      </div>

      {/* Provider Cards List */}
      <div className="space-y-4" aria-live="polite">
        {sortedProviders.length === 0 && (
          // /recommend can return 200 with an empty list if every candidate
          // was skipped during scoring (e.g. missing area data).
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-sm text-stone-500">
            No providers could be scored for this request.{" "}
            <Link href="/request" className="font-semibold text-teal-600 hover:underline">
              Try a different area or time
            </Link>
            .
          </div>
        )}
        {sortedProviders.map((provider, index) => {
          const scorePercent = Math.round(provider.reliability_score * 100);

          return (
            <div
              key={provider.provider_id}
              className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 hover:border-teal-200 transition-all space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                {/* Provider Info */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-400 w-5">
                      #{index + 1}
                    </span>
                    <h2 className="font-heading text-lg font-bold text-stone-900">
                      {provider.name}
                    </h2>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {ratingLabel(provider.rating)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600 pt-1">
                    {/* ETA with clock icon */}
                    <span className="inline-flex items-center gap-1">
                      <svg
                        className="w-4 h-4 text-stone-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {provider.estimated_travel_min} min ETA
                    </span>

                    {/* Distance with map-pin icon */}
                    <span className="inline-flex items-center gap-1">
                      <svg
                        className="w-4 h-4 text-stone-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      {provider.distance_km} km away
                    </span>

                    {/* Hourly rate */}
                    <span className="inline-flex items-center gap-1 font-semibold text-stone-800">
                      KES {provider.hourly_rate_ksh.toLocaleString()} / hr
                    </span>
                  </div>
                </div>

                {/* Select Provider: review step before anything is booked */}
                <Link
                  href={`/booking?provider=${provider.provider_id}`}
                  className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-sm transition-colors self-start whitespace-nowrap"
                >
                  Select Provider
                </Link>
              </div>

              {/* Reliability Score and Explanation Section */}
              <div className="pt-2 border-t border-stone-100 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-stone-700 font-semibold">
                      Reliability Score
                    </span>
                    <span
                      className={`font-bold ${
                        scorePercent >= 85
                          ? "text-teal-700"
                          : scorePercent >= 75
                          ? "text-teal-600"
                          : "text-amber-600"
                      }`}
                    >
                      {scorePercent}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div
                    className="w-full bg-stone-100 rounded-full h-2 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={scorePercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Reliability score for ${provider.name}`}
                  >
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        scorePercent >= 85
                          ? "bg-teal-700"
                          : scorePercent >= 75
                          ? "bg-teal-500"
                          : "bg-amber-500"
                      }`}
                      style={{ width: `${scorePercent}%` }}
                    />
                  </div>
                </div>

                {/* Explanation in italics */}
                <p className="text-xs italic text-stone-500">
                  {capitalize(provider.explanation)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
