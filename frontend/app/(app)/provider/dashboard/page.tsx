"use client";

import Link from "next/link";
// Active Bookings is live (GET /bookings?provider_id=). TODO: replace the other
// "Coming soon" stats once these endpoints exist:
//   Completion Rate        -> GET /provider/stats (completion_rate)
//   Average Rating         -> GET /provider/stats (rating)
//   This Month's Earnings  -> GET /provider/earnings?month=current
import { isActive, useBookings } from "../../../bookings-list";
import { useAuthGuard } from "../../../use-auth-guard";

const PLACEHOLDER_STATS = ["Completion Rate", "Average Rating", "This Month's Earnings"];

export default function ProviderDashboardPage() {
  const { auth, checked } = useAuthGuard(["provider"]);
  if (!checked) return null;

  return (
    <div className="space-y-10">
      <div className="rounded-lg border border-stone-200 bg-white p-8">
        <h1 className="font-heading text-3xl font-semibold text-stone-900">
          {auth?.name ? `Welcome back, ${auth.name}` : "Welcome back"}
        </h1>
        <p className="mt-2 text-base text-stone-500">Here&apos;s a quick look at your account.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <ActiveBookingsStat providerId={auth?.provider_id} />
        {PLACEHOLDER_STATS.map((label) => (
          <div key={label} className="rounded-lg border border-stone-200 bg-white p-6">
            <p className="text-sm font-medium text-stone-500">{label}</p>
            <p className="mt-3 font-heading text-2xl font-semibold text-stone-300">Coming soon</p>
          </div>
        ))}
      </div>

      <Link
        href="/provider/availability"
        className="block rounded-lg border border-stone-200 bg-white p-8 transition-colors hover:border-teal-700 hover:bg-teal-50"
      >
        <h2 className="font-heading text-xl font-semibold text-stone-900">Set your availability</h2>
        <p className="mt-2 text-sm text-stone-500">
          Let clients know which days and hours you&apos;re free to work.
        </p>
      </Link>
    </div>
  );
}

function ActiveBookingsStat({ providerId }: { providerId: string | undefined }) {
  const { bookings, state } = useBookings("provider", providerId);
  const value = state === "ready" ? String(bookings.filter(isActive).length) : state === "failed" ? "—" : "…";

  return (
    <Link
      href="/provider/dashboard/jobs"
      className="rounded-lg border border-stone-200 bg-white p-6 transition-colors hover:border-teal-700"
    >
      <p className="text-sm font-medium text-stone-500">Active Bookings</p>
      <p className="mt-3 font-heading text-2xl font-semibold text-stone-900">{value}</p>
    </Link>
  );
}
