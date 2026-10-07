"use client";

import { BookingsList } from "../../../../bookings-list";
import { useAuthGuard } from "../../../../use-auth-guard";

export default function ProviderJobsPage() {
  const { auth, checked } = useAuthGuard(["provider"]);
  if (!checked) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-semibold text-stone-900">Incoming Requests</h1>
        <p className="mt-1 text-base text-stone-500">
          Accept or decline new requests, and mark jobs completed when you&apos;re done.
        </p>
      </div>
      <BookingsList role="provider" ownerId={auth?.provider_id} />
    </div>
  );
}
