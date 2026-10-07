"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { readAuth, useAuthGuard } from "../../use-auth-guard";
import { StatusPill } from "../../bookings-list";
import { API_BASE_URL, NETWORK_ERROR_MESSAGE, apiErrorMessage } from "@/lib/api";
import {
  Booking,
  RankedProvider,
  RecommendRequest,
  TIME_SLOT_LABELS,
  capitalize,
  readRecommendation,
} from "@/lib/recommendation";

// Step 3 of the request flow.
//   /booking?provider=P0023 -> review the selected provider, then send the request
//   /booking?id=12          -> confirmation for a booking that now exists in the DB
export default function BookingPage() {
  return (
    <Suspense fallback={null}>
      <BookingStep />
    </Suspense>
  );
}

function BookingStep() {
  const { checked } = useAuthGuard(["client"]);
  const params = useSearchParams();
  const bookingId = params.get("id");
  const providerId = params.get("provider");

  if (!checked) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      {bookingId ? (
        <Confirmation bookingId={Number(bookingId)} />
      ) : (
        <Review providerId={providerId} />
      )}
    </div>
  );
}

function Review({ providerId }: { providerId: string | null }) {
  const router = useRouter();
  const [request, setRequest] = useState<RecommendRequest | null>(null);
  const [provider, setProvider] = useState<RankedProvider | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The provider and request context come from the /results list the
  // client just saw, so what they confirm is exactly what was shown.
  useEffect(() => {
    const result = readRecommendation();
    setRequest(result?.request ?? null);
    setProvider(result?.providers.find((p) => p.provider_id === providerId) ?? null);
    setLoaded(true);
  }, [providerId]);

  if (!loaded) return null;

  if (!request || !provider) {
    return (
      <EmptyState
        title="Nothing selected"
        text="Choose a provider from your recommendations first."
        href="/request"
        cta="Start a request"
      />
    );
  }

  const sendRequest = async () => {
    const auth = readAuth();
    if (!auth?.client_id) {
      setError("Your session has no client account. Please log in again.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: auth.client_id,
          provider_id: provider.provider_id,
          client_area: request.client_area,
          time_slot: request.time_slot,
          day_type: request.day_type,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(data));
        return;
      }
      // Replace so Back doesn't return to a page that would book again.
      router.replace(`/booking?id=${(data as Booking).booking_id}`);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <header>
        <p className="text-sm font-medium text-teal-700">Step 3 of 3</p>
        <h1 className="font-heading mt-1 text-3xl font-semibold text-stone-900">
          Confirm your booking
        </h1>
        <p className="mt-1 text-base text-stone-500">
          Review the details, then send the request to the provider.
        </p>
      </header>

      <section className="rounded-xl border border-stone-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-xl font-semibold text-stone-900">{provider.name}</h2>
            <p className="mt-0.5 text-sm text-stone-500">
              ★ {provider.rating.toFixed(1)} · KES {provider.hourly_rate_ksh.toLocaleString()} / hr
            </p>
          </div>
          <ScoreBadge score={provider.reliability_score} />
        </div>
        <p className="mt-4 text-sm italic text-stone-500">{capitalize(provider.explanation)}</p>
        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-stone-100 pt-6">
          <Detail label="Service" value={capitalize(request.service_type)} />
          <Detail label="Your area" value={request.client_area} />
          <Detail label="Time" value={TIME_SLOT_LABELS[request.time_slot] ?? request.time_slot} />
          <Detail label="Day" value={capitalize(request.day_type)} />
          <Detail label="Estimated travel" value={`${provider.estimated_travel_min} min`} />
          <Detail label="Distance" value={`${provider.distance_km} km`} />
        </dl>
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href="/results"
          className="rounded-lg border border-stone-300 px-4 py-2.5 text-center text-sm font-semibold text-stone-700 hover:bg-stone-50"
        >
          Back to results
        </Link>
        <button
          type="button"
          onClick={sendRequest}
          disabled={sending}
          className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Sending request..." : "Send booking request"}
        </button>
      </div>
    </>
  );
}

function Confirmation({ bookingId }: { bookingId: number }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");

  // Read back from the API (not from local state) so this page shows what
  // was actually stored, and still works after a refresh.
  // TODO: switch to GET /bookings/{id} if that endpoint is added.
  useEffect(() => {
    const auth = readAuth();
    if (!auth?.client_id) {
      setState("missing");
      return;
    }
    fetch(`${API_BASE_URL}/bookings?client_id=${encodeURIComponent(auth.client_id)}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<Booking[]>;
      })
      .then((list) => {
        const found = list.find((b) => b.booking_id === bookingId) ?? null;
        setBooking(found);
        setState(found ? "ready" : "missing");
      })
      .catch(() => setState("failed"));
  }, [bookingId]);

  if (state === "loading") {
    return <p className="text-sm text-stone-500">Loading booking...</p>;
  }
  if (state === "failed") {
    return (
      <p role="alert" className="text-sm text-red-600">
        {NETWORK_ERROR_MESSAGE}
      </p>
    );
  }
  if (state === "missing" || !booking) {
    return (
      <EmptyState
        title="Booking not found"
        text="We couldn't find this booking on your account."
        href="/dashboard/bookings"
        cta="Go to My Bookings"
      />
    );
  }

  return (
    <>
      <header>
        <p className="text-sm font-medium text-teal-700">
          {booking.status === "pending" ? "Request sent" : "Booking details"}
        </p>
        <h1 className="font-heading mt-1 text-3xl font-semibold text-stone-900">
          Booking #{booking.booking_id}
        </h1>
        {booking.status === "pending" && (
          <p className="mt-1 text-base text-stone-500">
            Your request was sent to {booking.provider_name}. You&apos;ll get a notification
            when they confirm or decline it.
          </p>
        )}
      </header>

      <section className="rounded-xl border border-stone-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-4">
          <Detail label="Status" value={<StatusPill status={booking.status} />} />
          <Detail label="Provider" value={booking.provider_name ?? booking.provider_id} />
          <Detail label="Service" value={capitalize(booking.service_type)} />
          <Detail label="Your area" value={booking.client_area} />
          <Detail label="Time" value={TIME_SLOT_LABELS[booking.time_slot] ?? booking.time_slot} />
          <Detail label="Day" value={capitalize(booking.day_type)} />
          <Detail
            label="Predicted reliability"
            value={
              booking.reliability_score !== null
                ? `${Math.round(booking.reliability_score * 100)}%`
                : "—"
            }
          />
          <Detail
            label="Rate"
            value={
              booking.provider_hourly_rate_ksh !== null
                ? `KES ${booking.provider_hourly_rate_ksh.toLocaleString()} / hr`
                : "—"
            }
          />
        </dl>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Link
          href="/request"
          className="rounded-lg border border-stone-300 px-4 py-2.5 text-center text-sm font-semibold text-stone-700 hover:bg-stone-50"
        >
          New request
        </Link>
        <Link
          href="/dashboard/bookings"
          className="rounded-lg bg-teal-700 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-teal-800"
        >
          Go to My Bookings
        </Link>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="mt-1 text-base text-stone-900">{value}</dd>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <div className="text-right">
      <p className="font-heading text-2xl font-semibold text-teal-700">{Math.round(score * 100)}%</p>
      <p className="text-xs text-stone-500">predicted reliability</p>
    </div>
  );
}

function EmptyState({
  title,
  text,
  href,
  cta,
}: {
  title: string;
  text: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="space-y-4 py-8 text-center">
      <h1 className="font-heading text-2xl font-semibold text-stone-900">{title}</h1>
      <p className="text-sm text-stone-500">{text}</p>
      <Link
        href={href}
        className="inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
      >
        {cta}
      </Link>
    </div>
  );
}
