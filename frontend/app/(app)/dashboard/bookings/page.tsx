"use client";

import { BookingsList } from "../../../bookings-list";
import { useAuthGuard } from "../../../use-auth-guard";

export default function ClientBookingsPage() {
  const { auth, checked } = useAuthGuard(["client"]);
  if (!checked) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-semibold text-stone-900">My Bookings</h1>
        <p className="mt-1 text-base text-stone-500">
          Requests you&apos;ve sent and their status. You can cancel a booking until it&apos;s completed.
        </p>
      </div>
      <BookingsList role="client" ownerId={auth?.client_id} />
    </div>
  );
}
