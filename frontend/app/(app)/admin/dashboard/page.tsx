"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { API_BASE_URL, NETWORK_ERROR_MESSAGE, apiErrorMessage } from "@/lib/api";
import { useAuthGuard } from "../../../use-auth-guard";

interface MetricSet {
  rmse: number;
  mae: number;
  r2: number;
}

interface AdminOverview {
  platform: {
    total_bookings: number;
    pending_bookings: number;
    confirmed_bookings: number;
    completed_bookings: number;
    cancelled_bookings: number;
    total_providers: number;
    verified_providers: number;
    pending_verifications: number;
    rejected_verifications: number;
    reviews: number;
    average_review_rating: number | null;
    providers_loaded: number;
    areas_loaded: number;
  };
  model: {
    dataset?: string;
    records?: number;
    train_records?: number;
    test_records?: number;
    trained_at?: string | null;
    verified_at?: string;
    train?: MetricSet;
    test?: MetricSet;
    cross_validation?: { folds: number; scope: string; rmse_mean: number; rmse_std: number };
  };
  retraining: {
    status: "idle" | "queued" | "running" | "succeeded" | "failed";
    requested_by: string | null;
    requested_at: string | null;
    completed_at: string | null;
    message: string;
  };
}

const number = (value: number | undefined, digits = 4) =>
  value === undefined ? "—" : value.toFixed(digits);

const when = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Not recorded for the packaged artifact";

export default function AdminDashboardPage() {
  const { auth, checked } = useAuthGuard(["admin"]);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!auth?.user_id) return;
    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/overview?admin_user_id=${encodeURIComponent(auth.user_id)}`,
        { cache: "no-store" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(data));
      setOverview(data as AdminOverview);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : NETWORK_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [auth?.user_id]);

  useEffect(() => {
    if (!checked || !auth) return;
    loadOverview();
    const timer = window.setInterval(loadOverview, 10_000);
    return () => window.clearInterval(timer);
  }, [auth, checked, loadOverview]);

  const triggerRetraining = async () => {
    if (!auth?.user_id) return;
    if (!window.confirm("Retrain the packaged model using the approved synthetic dataset now?")) return;
    setTriggering(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/model/retrain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_user_id: auth.user_id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(data));
      await loadOverview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : NETWORK_ERROR_MESSAGE);
    } finally {
      setTriggering(false);
    }
  };

  if (!checked) return null;

  const platform = overview?.platform;
  const model = overview?.model;
  const retraining = overview?.retraining;
  const jobActive = retraining?.status === "queued" || retraining?.status === "running";

  return (
    <div className="space-y-8">
      <header className="rounded-xl border border-stone-200 bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">System administrator</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold text-stone-900">
          {auth?.name ? `Welcome back, ${auth.name}` : "Administration dashboard"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-500">
          Verify provider identity, monitor platform and model performance, and control model retraining—the
          three administrator responsibilities defined in the use-case diagram.
        </p>
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={loadOverview} className="font-semibold underline">Retry</button>
        </div>
      )}

      <section aria-labelledby="platform-heading" className="space-y-4">
        <div>
          <h2 id="platform-heading" className="font-heading text-2xl font-semibold text-stone-900">Monitor System Performance</h2>
          <p className="mt-1 text-sm text-stone-500">Live operational counts from PostgreSQL and the API process.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ["Total bookings", platform?.total_bookings],
            ["Completed", platform?.completed_bookings],
            ["Providers", platform?.total_providers],
            ["Verified providers", platform?.verified_providers],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-stone-200 bg-white p-5">
              <p className="text-sm text-stone-500">{label}</p>
              <p className="mt-2 font-heading text-3xl font-semibold text-stone-900">
                {loading ? "…" : String(value ?? 0)}
              </p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-stone-200 bg-white p-5 text-sm text-stone-600">
            <p className="font-semibold text-stone-900">Booking state</p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <dt>Pending</dt><dd className="text-right font-semibold">{platform?.pending_bookings ?? "—"}</dd>
              <dt>Confirmed</dt><dd className="text-right font-semibold">{platform?.confirmed_bookings ?? "—"}</dd>
              <dt>Cancelled</dt><dd className="text-right font-semibold">{platform?.cancelled_bookings ?? "—"}</dd>
            </dl>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-5 text-sm text-stone-600">
            <p className="font-semibold text-stone-900">Service health</p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <dt>Providers loaded</dt><dd className="text-right font-semibold">{platform?.providers_loaded ?? "—"}</dd>
              <dt>Areas loaded</dt><dd className="text-right font-semibold">{platform?.areas_loaded ?? "—"}</dd>
              <dt>Reviews</dt><dd className="text-right font-semibold">{platform?.reviews ?? "—"}</dd>
            </dl>
          </div>
          <Link href="/admin/verify-providers" className="rounded-lg border border-purple-200 bg-purple-50 p-5 transition hover:border-purple-400">
            <p className="font-semibold text-purple-950">Verify Provider Identity</p>
            <p className="mt-2 text-3xl font-semibold text-purple-900">{platform?.pending_verifications ?? "—"}</p>
            <p className="mt-1 text-sm text-purple-800">pending review · open verification queue →</p>
          </Link>
        </div>
      </section>

      <section aria-labelledby="model-heading" className="space-y-4">
        <div>
          <h2 id="model-heading" className="font-heading text-2xl font-semibold text-stone-900">Model Performance</h2>
          <p className="mt-1 text-sm text-stone-500">
            Evaluation evidence for the deployed regression pipeline. Dataset: {model?.dataset ?? "—"}.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr><th className="px-4 py-3">Partition</th><th className="px-4 py-3">Records</th><th className="px-4 py-3">RMSE</th><th className="px-4 py-3">MAE</th><th className="px-4 py-3">R²</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-700">
              <tr><th className="px-4 py-3 font-semibold">Training</th><td className="px-4 py-3">{model?.train_records ?? "—"}</td><td className="px-4 py-3">{number(model?.train?.rmse)}</td><td className="px-4 py-3">{number(model?.train?.mae)}</td><td className="px-4 py-3">{number(model?.train?.r2)}</td></tr>
              <tr><th className="px-4 py-3 font-semibold">Held-out test</th><td className="px-4 py-3">{model?.test_records ?? "—"}</td><td className="px-4 py-3">{number(model?.test?.rmse)}</td><td className="px-4 py-3">{number(model?.test?.mae)}</td><td className="px-4 py-3">{number(model?.test?.r2)}</td></tr>
            </tbody>
          </table>
          <div className="border-t border-stone-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
            {model?.cross_validation
              ? `${model.cross_validation.folds}-fold validation RMSE ${number(model.cross_validation.rmse_mean)} ± ${number(model.cross_validation.rmse_std)} — ${model.cross_validation.scope}`
              : "Cross-validation evidence unavailable."}
          </div>
        </div>
      </section>

      <section id="model-retraining" aria-labelledby="retrain-heading" className="rounded-xl border border-stone-200 bg-white p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <h2 id="retrain-heading" className="font-heading text-2xl font-semibold text-stone-900">Trigger Model Retraining</h2>
            <p className="mt-2 max-w-2xl text-sm text-stone-500">
              Rebuilds the fixed pipeline from the approved synthetic dataset, evaluates it, atomically replaces the model artifact, and reloads the API pipeline.
            </p>
          </div>
          <button
            type="button"
            onClick={triggerRetraining}
            disabled={triggering || jobActive || !overview}
            className="shrink-0 rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {jobActive ? "Retraining…" : triggering ? "Queuing…" : "Retrain model"}
          </button>
        </div>
        <div className="mt-5 rounded-lg bg-stone-50 p-4 text-sm text-stone-600" aria-live="polite">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${retraining?.status === "failed" ? "bg-red-500" : jobActive ? "animate-pulse bg-amber-500" : retraining?.status === "succeeded" ? "bg-emerald-500" : "bg-stone-400"}`} />
            <span className="font-semibold capitalize text-stone-900">{retraining?.status ?? "loading"}</span>
          </div>
          <p className="mt-2">{retraining?.message ?? "Loading retraining status…"}</p>
          <p className="mt-2 text-xs text-stone-400">Last model run: {when(model?.trained_at ?? model?.verified_at)}</p>
        </div>
        <p className="mt-4 text-xs text-amber-700">
          Prototype control: the administrator ID is checked against PostgreSQL, but production still requires signed server sessions and a durable job queue.
        </p>
      </section>
    </div>
  );
}
