"use client";

import { useAuthGuard } from "../../../../use-auth-guard";

export default function ProviderJobsPage() {
  const { checked } = useAuthGuard(["provider"]);
  if (!checked) return null;

  return (
    <div>
      <h1 className="font-heading text-3xl font-semibold text-stone-900">Dashboard</h1>
      <p className="mt-3 text-base text-stone-500">Coming soon.</p>
    </div>
  );
}
