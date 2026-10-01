"use client";

import Link from "next/link";
// TODO: replace "Coming soon" once these endpoints exist:
//   Total Bookings         -> GET /admin/stats (total_bookings)
//   Active Providers       -> GET /admin/stats (active_providers)
//   Pending Verifications  -> GET /admin/providers?is_verified=false (count)
import { useAuthGuard } from "../../../use-auth-guard";

const STAT_LABELS = ["Total Bookings", "Active Providers", "Pending Verifications"];

export default function AdminDashboardPage() {
  const { auth, checked } = useAuthGuard(["admin"]);
  if (!checked) return null;

  return (
    <div className="space-y-10">
      <div className="rounded-lg border border-stone-200 bg-white p-8">
        <h1 className="font-heading text-3xl font-semibold text-stone-900">
          {auth?.name ? `Welcome back, ${auth.name}` : "Welcome back"}
        </h1>
        <p className="mt-2 text-base text-stone-500">Platform activity at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STAT_LABELS.map((label) => (
          <div key={label} className="rounded-lg border border-stone-200 bg-white p-6">
            <p className="text-sm font-medium text-stone-500">{label}</p>
            <p className="mt-3 font-heading text-2xl font-semibold text-stone-300">Coming soon</p>
          </div>
        ))}
      </div>

      <Link
        href="/admin/verify-providers"
        className="block rounded-lg border border-stone-200 bg-white p-8 transition-colors hover:border-teal-700 hover:bg-teal-50"
      >
        <h2 className="font-heading text-xl font-semibold text-stone-900">
          Review pending provider applications
        </h2>
        <p className="mt-2 text-sm text-stone-500">Approve or reject providers waiting on verification.</p>
      </Link>
    </div>
  );
}
