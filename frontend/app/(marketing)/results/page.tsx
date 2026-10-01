"use client";

import React, { useState, useMemo } from "react";

interface Provider {
  id: string;
  name: string;
  rating: number;
  reliability_score: number;
  estimated_travel_min: number;
  distance_km: number;
  hourly_rate_ksh: number;
  explanation: string;
}

const MOCK_PROVIDERS: Provider[] = [
  {
    id: "P0023",
    name: "John Mwangi",
    rating: 4.8,
    reliability_score: 0.94,
    estimated_travel_min: 16.5,
    distance_km: 3.8,
    hourly_rate_ksh: 850,
    explanation: "Clear route at this time; strong historical completion rate",
  },
  {
    id: "P0145",
    name: "Faith Achieng",
    rating: 4.9,
    reliability_score: 0.89,
    estimated_travel_min: 22.0,
    distance_km: 5.2,
    hourly_rate_ksh: 1100,
    explanation: "Good road access to provider's base area; high on-time record",
  },
  {
    id: "P0088",
    name: "David Kiprop",
    rating: 4.6,
    reliability_score: 0.82,
    estimated_travel_min: 28.4,
    distance_km: 7.1,
    hourly_rate_ksh: 750,
    explanation: "Moderate congestion on primary corridor; consistent reliability",
  },
  {
    id: "P0176",
    name: "Mercy Wanjiku",
    rating: 4.7,
    reliability_score: 0.76,
    estimated_travel_min: 34.0,
    distance_km: 9.4,
    hourly_rate_ksh: 900,
    explanation: "Heavy congestion on connecting arterial route at current time slot",
  },
  {
    id: "P0103",
    name: "Samuel Omondi",
    rating: 4.4,
    reliability_score: 0.68,
    estimated_travel_min: 42.5,
    distance_km: 12.3,
    hourly_rate_ksh: 650,
    explanation: "Higher distance and delay potential during active rush period",
  },
];

type SortKey = "reliability" | "distance" | "price" | "rating";

export default function ResultsPage() {
  const [sortBy, setSortBy] = useState<SortKey>("reliability");

  const sortedProviders = useMemo(() => {
    const list = [...MOCK_PROVIDERS];
    switch (sortBy) {
      case "reliability":
        return list.sort((a, b) => b.reliability_score - a.reliability_score);
      case "distance":
        return list.sort((a, b) => a.distance_km - b.distance_km);
      case "price":
        return list.sort((a, b) => a.hourly_rate_ksh - b.hourly_rate_ksh);
      case "rating":
        return list.sort((a, b) => b.rating - a.rating);
      default:
        return list;
    }
  }, [sortBy]);

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-4 py-8">
      {/* 3-Step Progress Indicator */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 -z-0" />

          {/* Step 1: Completed */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-semibold text-sm">
              ✓
            </span>
            <span className="text-sm font-medium text-slate-600">
              Request Details
            </span>
          </div>

          {/* Step 2: Active */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-sm shadow-sm">
              2
            </span>
            <span className="text-sm font-semibold text-indigo-600">
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

      {/* Header and Sorting Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Recommended Providers
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Ranked by context-aware arrival reliability and location factors
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="sortSelect" className="text-xs font-medium text-slate-600 whitespace-nowrap">
            Sort by:
          </label>
          <select
            id="sortSelect"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="reliability">Reliability Score (High to Low)</option>
            <option value="distance">Distance (Nearest First)</option>
            <option value="price">Price (Lowest First)</option>
            <option value="rating">Rating (Highest First)</option>
          </select>
        </div>
      </div>

      {/* Provider Cards List */}
      <div className="space-y-4">
        {sortedProviders.map((provider, index) => {
          const scorePercent = Math.round(provider.reliability_score * 100);

          return (
            <div
              key={provider.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-indigo-200 transition-all space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                {/* Provider Info */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-5">
                      #{index + 1}
                    </span>
                    <h2 className="text-lg font-bold text-slate-900">
                      {provider.name}
                    </h2>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      ★ {provider.rating.toFixed(1)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
                    {/* ETA with clock icon */}
                    <span className="inline-flex items-center gap-1">
                      <svg
                        className="w-4 h-4 text-slate-400"
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
                        className="w-4 h-4 text-slate-400"
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
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                      KES {provider.hourly_rate_ksh.toLocaleString()} / hr
                    </span>
                  </div>
                </div>

                {/* Select Provider Button */}
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors self-start whitespace-nowrap"
                >
                  Select Provider
                </button>
              </div>

              {/* Reliability Score and Explanation Section */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-700 font-semibold">
                      Reliability Score
                    </span>
                    <span
                      className={`font-bold ${
                        scorePercent >= 85
                          ? "text-emerald-600"
                          : scorePercent >= 75
                          ? "text-indigo-600"
                          : "text-amber-600"
                      }`}
                    >
                      {scorePercent}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        scorePercent >= 85
                          ? "bg-emerald-500"
                          : scorePercent >= 75
                          ? "bg-indigo-500"
                          : "bg-amber-500"
                      }`}
                      style={{ width: `${scorePercent}%` }}
                    />
                  </div>
                </div>

                {/* Explanation in italics */}
                <p className="text-xs italic text-slate-500">
                  {provider.explanation}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
