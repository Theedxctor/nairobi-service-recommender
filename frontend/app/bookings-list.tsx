"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL, NETWORK_ERROR_MESSAGE, apiErrorMessage } from "@/lib/api";
import { Booking, TIME_SLOT_LABELS, capitalize } from "@/lib/recommendation";

export type BookingRole = "client" | "provider";

type Status = Booking["status"];

// Mirrors BOOKING_TRANSITIONS in ml-service/api.py; the API is still the
// source of truth and rejects anything not allowed there.
const ACTIONS: Record<BookingRole, Partial<Record<Status, { to: Status; label: string; primary?: boolean }[]>>> = {
  client: {
    pending: [{ to: "cancelled", label: "Cancel request" }],
    confirmed: [{ to: "cancelled", label: "Cancel booking" }],
  },
  provider: {
    pending: [
      { to: "confirmed", label: "Accept", primary: true },
      { to: "cancelled", label: "Decline" },
    ],
    confirmed: [
      { to: "completed", label: "Mark completed", primary: true },
      { to: "cancelled", label: "Cancel" },
    ],
  },
};

const STATUS_STYLES: Record<Status, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  confirmed: "bg-teal-50 text-teal-800 border-teal-200",
  completed: "bg-stone-100 text-stone-700 border-stone-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {capitalize(status)}
    </span>
  );
}

export const isActive = (b: Booking) => b.status === "pending" || b.status === "confirmed";

/** Loads GET /bookings for one client or provider. */
export function useBookings(role: BookingRole, ownerId: string | undefined) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  const load = useCallback(() => {
    if (!ownerId) return;
    setState("loading");
    fetch(`${API_BASE_URL}/bookings?${role}_id=${encodeURIComponent(ownerId)}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<Booking[]>;
      })
      .then((list) => {
        setBookings(list);
        setState("ready");
      })
      .catch(() => setState("failed"));
  }, [role, ownerId]);

  useEffect(load, [load]);

  const replace = (updated: Booking) =>
    setBookings((list) => list.map((b) => (b.booking_id === updated.booking_id ? updated : b)));

  return { bookings, state, reload: load, replace };
}

export function BookingsList({ role, ownerId }: { role: BookingRole; ownerId: string | undefined }) {
  const { bookings, state, reload, replace } = useBookings(role, ownerId);

  if (state === "loading") return <p className="text-sm text-stone-500">Loading bookings...</p>;

  if (state === "failed") {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        <span>{NETWORK_ERROR_MESSAGE}</span>
        <button
          type="button"
          onClick={reload}
          className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-100"
        >
          Retry
        </button>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center">
        {role === "client" ? (
          <>
            <p className="text-base text-stone-500">You haven&apos;t made a booking yet.</p>
            <Link
              href="/request"
              className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:text-teal-800"
            >
              Request your first service &rarr;
            </Link>
          </>
        ) : (
          <>
            <p className="text-base text-stone-500">No booking requests yet.</p>
            <p className="mt-1 text-sm text-stone-400">
              Clients can only book you in time slots you&apos;ve marked as available.
            </p>
            <Link
              href="/provider/availability"
              className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:text-teal-800"
            >
              Check your availability &rarr;
            </Link>
          </>
        )}
      </div>
    );
  }

  const active = bookings.filter(isActive);
  const past = bookings.filter((b) => !isActive(b));

  return (
    <div className="space-y-10">
      <Section title={role === "client" ? "Active" : "Requests & upcoming jobs"} empty="Nothing active right now.">
        {active.map((b) => (
          <BookingCard key={b.booking_id} booking={b} role={role} ownerId={ownerId!} onUpdated={replace} />
        ))}
      </Section>
      <Section title="Past" empty="No past bookings yet.">
        {past.map((b) => (
          <BookingCard key={b.booking_id} booking={b} role={role} ownerId={ownerId!} onUpdated={replace} />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h2 className="font-heading text-xl font-semibold text-stone-900">
        {title} <span className="text-base font-normal text-stone-400">({children.length})</span>
      </h2>
      <div className="mt-4 space-y-3">
        {children.length ? children : <p className="text-sm text-stone-400">{empty}</p>}
      </div>
    </section>
  );
}

export function BookingCard({
  booking,
  role,
  ownerId,
  onUpdated,
}: {
  booking: Booking;
  role: BookingRole;
  ownerId: string;
  onUpdated?: (b: Booking) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions = onUpdated ? ACTIONS[role][booking.status] ?? [] : [];
  const counterpart =
    role === "client"
      ? booking.provider_name ?? booking.provider_id
      : booking.client_name ?? booking.client_id;

  const act = async (to: Status, label: string) => {
    if (to === "cancelled" && !window.confirm(`${label.split(" ")[0]} booking #${booking.booking_id}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${booking.booking_id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to, actor: role, actor_id: ownerId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(data));
        return;
      }
      onUpdated?.(data as Booking);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-lg border border-stone-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg font-semibold text-stone-900">{counterpart}</h3>
            <StatusPill status={booking.status} />
          </div>
          <p className="text-sm text-stone-600">
            {capitalize(booking.service_type)} · {booking.client_area} ·{" "}
            {TIME_SLOT_LABELS[booking.time_slot] ?? booking.time_slot} · {capitalize(booking.day_type)}
          </p>
          <p className="text-xs text-stone-400">
            {role === "client" ? (
              <Link href={`/booking?id=${booking.booking_id}`} className="hover:text-teal-700 hover:underline">
                Booking #{booking.booking_id}
              </Link>
            ) : (
              <>Booking #{booking.booking_id}</>
            )}{" "}
            · requested {new Date(booking.created_at).toLocaleString()}
            {booking.reliability_score !== null &&
              ` · predicted reliability ${Math.round(booking.reliability_score * 100)}%`}
          </p>
        </div>

        {actions.length > 0 && (
          <div className="flex shrink-0 gap-2">
            {actions.map(({ to, label, primary }) => (
              <button
                key={to}
                type="button"
                disabled={busy}
                onClick={() => act(to, label)}
                className={
                  primary
                    ? "rounded-md bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                    : "rounded-md border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </article>
  );
}
