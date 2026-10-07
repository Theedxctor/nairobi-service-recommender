"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BoltIcon, BriefcaseIcon, SparkleIcon, WrenchIcon } from "../../icons";
import { BookingCard, useBookings } from "../../bookings-list";
import { useAuthGuard } from "../../use-auth-guard";

import { API_BASE_URL } from "@/lib/api";

const SERVICE_ICONS: Record<string, typeof BriefcaseIcon> = {
  plumber: WrenchIcon,
  electrician: BoltIcon,
  cleaner: SparkleIcon,
};

export default function ClientDashboardPage() {
  const { auth, checked } = useAuthGuard(["client"]);
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);

  useEffect(() => {
    if (!checked) return;
    fetch(`${API_BASE_URL}/service_types`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: string[]) => setServiceTypes(Array.isArray(data) ? data : []))
      .catch(() => setServiceTypes([]))
      .finally(() => setLoadingTypes(false));
  }, [checked]);

  if (!checked) return null;

  return (
    <div className="space-y-10">
      {/* Welcome banner */}
      <div className="rounded-lg border border-stone-200 bg-white p-8">
        <h1 className="font-heading text-3xl font-semibold text-stone-900">
          {auth?.name ? `Welcome back, ${auth.name}` : "Welcome back"}
        </h1>
        <p className="mt-2 text-base text-stone-500">
          Find a reliable provider for whatever you need done next.
        </p>
        <Link
          href="/request"
          className="mt-5 inline-flex items-center justify-center rounded-md bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800"
        >
          Request a Service
        </Link>
      </div>

      {/* Service categories -- from the real GET /service_types endpoint */}
      <div>
        <h2 className="font-heading text-xl font-semibold text-stone-900">Browse by service</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {loadingTypes && <p className="col-span-full text-sm text-stone-500">Loading service types...</p>}
          {!loadingTypes && serviceTypes.length === 0 && (
            <p className="col-span-full text-sm text-stone-500">Could not load service types right now.</p>
          )}
          {serviceTypes.map((type) => {
            const Icon = SERVICE_ICONS[type.toLowerCase()] ?? BriefcaseIcon;
            return (
              // /request doesn't read query params yet, so this navigates plain rather than pre-filling.
              <Link
                key={type}
                href="/request"
                className="flex flex-col items-center gap-3 rounded-lg border border-stone-200 bg-white p-6 text-center transition-colors hover:border-teal-700 hover:bg-teal-50"
              >
                <Icon className="h-7 w-7 text-teal-700" />
                <span className="text-sm font-semibold capitalize text-stone-900">{type}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="font-heading text-xl font-semibold text-stone-900">Recent Activity</h2>
        <RecentBookings clientId={auth?.client_id} />
      </div>
    </div>
  );
}

// Latest three bookings; the full list (with cancel actions) is on My Bookings.
function RecentBookings({ clientId }: { clientId: string | undefined }) {
  const { bookings, state } = useBookings("client", clientId);

  if (state === "loading") return <p className="mt-4 text-sm text-stone-500">Loading...</p>;
  if (state === "failed") {
    return <p className="mt-4 text-sm text-red-600">Couldn&apos;t load your bookings right now.</p>;
  }
  if (bookings.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center">
        <p className="text-base text-stone-500">You haven&apos;t made a booking yet.</p>
        <Link href="/request" className="mt-3 inline-block text-sm font-semibold text-teal-700 hover:text-teal-800">
          Request your first service &rarr;
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      {bookings.slice(0, 3).map((b) => (
        <BookingCard key={b.booking_id} booking={b} role="client" ownerId={clientId!} />
      ))}
      <Link href="/dashboard/bookings" className="inline-block text-sm font-semibold text-teal-700 hover:text-teal-800">
        View all bookings &rarr;
      </Link>
    </div>
  );
}
