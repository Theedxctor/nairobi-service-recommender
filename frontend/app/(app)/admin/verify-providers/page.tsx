"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { API_BASE_URL, NETWORK_ERROR_MESSAGE, apiErrorMessage } from "@/lib/api";
import { useAuthGuard } from "../../../use-auth-guard";

type VerificationStatus = "pending" | "approved" | "rejected";

interface ProviderReview {
  provider_id: string;
  name: string;
  service_type: string;
  base_area_name: string | null;
  phone: string | null;
  email: string | null;
  status: VerificationStatus;
  is_verified: boolean;
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  registered_at: string | null;
}

const STATUS_STYLE: Record<VerificationStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
};

export default function VerifyProvidersPage() {
  const { auth, checked } = useAuthGuard(["admin"]);
  const [providers, setProviders] = useState<ProviderReview[]>([]);
  const [filter, setFilter] = useState<VerificationStatus>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!auth?.user_id) return;
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/providers?admin_user_id=${encodeURIComponent(auth.user_id)}`,
        { cache: "no-store" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(data));
      setProviders(data as ProviderReview[]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : NETWORK_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [auth?.user_id]);

  useEffect(() => {
    if (checked && auth) load();
  }, [auth, checked, load]);

  const counts = useMemo(() => ({
    pending: providers.filter((provider) => provider.status === "pending").length,
    approved: providers.filter((provider) => provider.status === "approved").length,
    rejected: providers.filter((provider) => provider.status === "rejected").length,
  }), [providers]);
  const visible = providers.filter((provider) => provider.status === filter);

  const decide = async (provider: ProviderReview, decision: "approve" | "reject") => {
    if (!auth?.user_id) return;
    if (decision === "reject" && !(notes[provider.provider_id] ?? "").trim()) {
      setError("Add a review note before rejecting a provider.");
      return;
    }
    setBusy(provider.provider_id);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/providers/${provider.provider_id}/verification`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_user_id: auth.user_id,
          decision,
          note: (notes[provider.provider_id] ?? "").trim() || null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(data));
      setProviders((current) => current.map((item) => item.provider_id === provider.provider_id ? data as ProviderReview : item));
      setNotes((current) => ({ ...current, [provider.provider_id]: "" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : NETWORK_ERROR_MESSAGE);
    } finally {
      setBusy(null);
    }
  };

  if (!checked) return null;

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-purple-700">Administrator use case</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold text-stone-900">Verify Provider Identity</h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-500">
          Review provider account and profile evidence, record an approval or rejection, and keep an audit note.
        </p>
      </header>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        This prototype stores contact and provider-profile evidence only; it does not yet collect identity-document uploads. Do not describe this as government-ID verification.
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Verification status">
        {(["pending", "approved", "rejected"] as VerificationStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={filter === status}
            onClick={() => setFilter(status)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize ${filter === status ? STATUS_STYLE[status] : "border-stone-200 bg-white text-stone-600"}`}
          >
            {status} ({counts[status]})
          </button>
        ))}
        <button type="button" onClick={load} className="ml-auto rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">Refresh</button>
      </div>

      {loading ? (
        <p className="text-sm text-stone-500">Loading provider verification queue…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">No {filter} providers.</div>
      ) : (
        <div className="space-y-4">
          {visible.map((provider) => (
            <article key={provider.provider_id} className="rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-heading text-xl font-semibold text-stone-900">{provider.name}</h2>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[provider.status]}`}>{provider.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">{provider.provider_id} · {provider.service_type} · {provider.base_area_name ?? "Area not recorded"}</p>
                </div>
                {provider.reviewed_at && <p className="text-xs text-stone-400">Reviewed {new Date(provider.reviewed_at).toLocaleString()}</p>}
              </div>

              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-stone-400">Account email</dt><dd className="font-medium text-stone-800">{provider.email ?? "No linked login account"}</dd></div>
                <div><dt className="text-stone-400">Phone</dt><dd className="font-medium text-stone-800">{provider.phone ?? "Not recorded"}</dd></div>
                <div><dt className="text-stone-400">Registration</dt><dd className="font-medium text-stone-800">{provider.registered_at ? new Date(provider.registered_at).toLocaleDateString() : "Imported provider"}</dd></div>
                <div><dt className="text-stone-400">Reviewed by</dt><dd className="font-medium text-stone-800">{provider.reviewed_by ?? "Not yet reviewed"}</dd></div>
              </dl>

              {provider.review_note && <p className="mt-4 rounded-md bg-stone-50 p-3 text-sm text-stone-600"><span className="font-semibold text-stone-800">Previous note:</span> {provider.review_note}</p>}

              <div className="mt-5 border-t border-stone-100 pt-5">
                <label htmlFor={`note-${provider.provider_id}`} className="text-sm font-medium text-stone-700">Review note <span className="font-normal text-stone-400">(required for rejection)</span></label>
                <textarea
                  id={`note-${provider.provider_id}`}
                  maxLength={500}
                  rows={2}
                  value={notes[provider.provider_id] ?? ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [provider.provider_id]: event.target.value }))}
                  disabled={busy === provider.provider_id}
                  className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  placeholder="Evidence checked or reason for the decision"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => decide(provider, "approve")} disabled={busy === provider.provider_id} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">Approve identity</button>
                  <button type="button" onClick={() => decide(provider, "reject")} disabled={busy === provider.provider_id} className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Reject</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
