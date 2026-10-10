"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuthGuard } from "../../use-auth-guard";
import { API_BASE_URL, NETWORK_ERROR_MESSAGE, apiErrorMessage } from "@/lib/api";
import {
  RankedProvider,
  RecommendRequest,
  RecommendationResult,
  TIME_SLOT_LABELS,
  capitalize,
  ratingLabel,
  readRecommendation,
  saveRecommendation,
} from "@/lib/recommendation";

type SortKey = "reliability" | "distance" | "price" | "rating";

// Form state for the filters (#79); strings so an empty field means "no limit".
interface Filters {
  maxPrice: string;
  minRating: string;
  verifiedOnly: boolean;
}

const NO_FILTERS: Filters = { maxPrice: "", minRating: "", verifiedOnly: false };

function filtersOf(request: RecommendRequest): Filters {
  return {
    maxPrice: request.max_hourly_rate_ksh?.toString() ?? "",
    minRating: request.min_rating?.toString() ?? "",
    verifiedOnly: request.verified_only ?? false,
  };
}

function hasFilters(request: RecommendRequest): boolean {
  return (
    request.max_hourly_rate_ksh !== undefined ||
    request.min_rating !== undefined ||
    request.verified_only === true
  );
}

export default function ResultsPage() {
  const { checked } = useAuthGuard(["client"]);
  const [sortBy, setSortBy] = useState<SortKey>("reliability");
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtering, setFiltering] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);

  // Load the optional "New on NaiServe" section once per search, after the
  // ranked list is shown, and keep it with the result so /booking can find
  // a provider selected from it. A failure just means no section.
  const loadNewProviders = (saved: RecommendationResult) => {
    fetch(`${API_BASE_URL}/recommend/new-providers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...saved.request, limit: 2 }),
    })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((newProviders: RankedProvider[]) => {
        // Ignore the answer if another search replaced this one meanwhile.
        const current = readRecommendation();
        if (!current || JSON.stringify(current.request) !== JSON.stringify(saved.request)) return;
        const updated = { ...saved, newProviders };
        saveRecommendation(updated);
        setResult(updated);
      });
  };

  // Written by /request after a successful POST /recommend.
  useEffect(() => {
    const saved = readRecommendation();
    setResult(saved);
    setLoaded(true);
    if (saved) setFilters(filtersOf(saved.request));
    if (saved && saved.newProviders === undefined) loadNewProviders(saved);
  }, []);

  // Filters run in the API over every available provider, before the top-10
  // cut, so this re-runs the search rather than hiding cards already shown.
  const applyFilters = async (next: Filters) => {
    if (!result) return;
    const maxPrice = next.maxPrice.trim() === "" ? undefined : Number(next.maxPrice);
    if (maxPrice !== undefined && (!Number.isInteger(maxPrice) || maxPrice < 1)) {
      setFilterError("Enter the price limit as a whole number of shillings.");
      return;
    }
    const base: RecommendRequest = { ...result.request };
    delete base.max_hourly_rate_ksh;
    delete base.min_rating;
    delete base.verified_only;
    const body: RecommendRequest = {
      ...base,
      ...(maxPrice !== undefined && { max_hourly_rate_ksh: maxPrice }),
      ...(next.minRating !== "" && { min_rating: Number(next.minRating) }),
      ...(next.verifiedOnly && { verified_only: true }),
    };

    setFiltering(true);
    setFilterError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // The list on screen stays as it was; only the message changes.
        setFilterError(apiErrorMessage(data));
        return;
      }
      const updated: RecommendationResult = { request: body, providers: data as RankedProvider[] };
      saveRecommendation(updated);
      setResult(updated);
      setFilters(next);
      loadNewProviders(updated);
    } catch {
      setFilterError(NETWORK_ERROR_MESSAGE);
    } finally {
      setFiltering(false);
    }
  };

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
      <div className="max-w-3xl py-12 text-center space-y-4">
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
  const newProviders = result.newProviders ?? [];

  return (
    <div className="max-w-3xl space-y-6">
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
            {capitalize(request.service_type)}{" "}
            {request.client_lat !== undefined ? `near ${request.client_area} (exact location)` : `in ${request.client_area}`} ·{" "}
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

      {/* Filters */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters(filters);
        }}
        aria-label="Filter providers"
        className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div>
            <label htmlFor="maxPrice" className="block text-xs font-medium text-stone-600 mb-1">
              Price limit (KES / hr)
            </label>
            <input
              id="maxPrice"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="Any"
              value={filters.maxPrice}
              onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
              className="w-36 px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-800 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          <div>
            <label htmlFor="minRating" className="block text-xs font-medium text-stone-600 mb-1">
              Minimum rating
            </label>
            <select
              id="minRating"
              value={filters.minRating}
              onChange={(e) => setFilters({ ...filters, minRating: e.target.value })}
              className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-800 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">Any</option>
              <option value="3">3.0 and above</option>
              <option value="3.5">3.5 and above</option>
              <option value="4">4.0 and above</option>
              <option value="4.5">4.5 and above</option>
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-700 sm:pb-2">
            <input
              id="verifiedOnly"
              type="checkbox"
              checked={filters.verifiedOnly}
              onChange={(e) => setFilters({ ...filters, verifiedOnly: e.target.checked })}
              className="h-4 w-4 rounded border-stone-300 text-teal-700 focus:ring-teal-500"
            />
            Verified providers only
          </label>
          <div className="flex items-center gap-2 sm:ml-auto">
            {hasFilters(request) && (
              <button
                type="button"
                onClick={() => applyFilters(NO_FILTERS)}
                disabled={filtering}
                className="px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 text-xs font-semibold hover:bg-stone-50 disabled:opacity-60"
              >
                Clear filters
              </button>
            )}
            <button
              type="submit"
              disabled={filtering}
              className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-sm disabled:opacity-60"
            >
              {filtering ? "Applying..." : "Apply filters"}
            </button>
          </div>
        </div>
        <p className="text-xs text-stone-500">
          Filters search every available provider, not only the ones listed below, and
          keep the reliability ranking. A minimum rating hides providers who have not
          been rated yet.
        </p>
        {filterError && (
          <p role="alert" className="text-xs font-medium text-red-700">
            {filterError}
          </p>
        )}
      </form>

      {/* Provider Cards List */}
      <div className="space-y-4" aria-live="polite">
        {sortedProviders.length === 0 && hasFilters(request) && (
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-sm text-stone-500">
            No available providers match these filters.{" "}
            <button
              type="button"
              onClick={() => applyFilters(NO_FILTERS)}
              className="font-semibold text-teal-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
        {sortedProviders.length === 0 && !hasFilters(request) && (
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
        {sortedProviders.map((provider, index) => (
          <ProviderCard key={provider.provider_id} provider={provider} rankLabel={`#${index + 1}`} />
        ))}
      </div>

      {newProviders.length > 0 && (
        <section aria-labelledby="new-providers-heading" className="space-y-4 pt-4">
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-5">
            <h2 id="new-providers-heading" className="font-heading text-lg font-semibold text-stone-900">
              New on NaiServe
            </h2>
            <p className="mt-1 text-sm text-stone-600">
               These providers have no recorded completion-rate history yet, so their
               reliability score assumes a typical (platform-median) completion rate. They
              are shown here rather than ranked alongside providers with a track record.
            </p>
          </div>
          {newProviders.map((provider) => (
            <ProviderCard key={provider.provider_id} provider={provider} />
          ))}
        </section>
      )}
    </div>
  );
}

function ProviderCard({ provider, rankLabel }: { provider: RankedProvider; rankLabel?: string }) {
  const scorePercent = Math.round(provider.reliability_score * 100);

  return (
    <div
            className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 hover:border-teal-200 transition-all space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        {/* Provider Info */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {rankLabel && (
              <span className="text-xs font-bold text-stone-400 w-5">{rankLabel}</span>
            )}
            <h2 className="font-heading text-lg font-bold text-stone-900">
              {provider.name}
            </h2>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              {ratingLabel(provider.rating, provider.review_count)}
            </span>
            {provider.is_verified && (
              <span className="inline-flex items-center text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                Verified
              </span>
            )}
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
}
