"use client";

import { useEffect, useState } from "react";
import { useAuthGuard } from "../../use-auth-guard";

import { API_BASE_URL, NETWORK_ERROR_MESSAGE, apiErrorMessage } from "@/lib/api";
import type { LocateResult } from "@/lib/location";
import { LocationField } from "../../location-field";
import type { LatLng } from "../../location-picker";
import { ratingLabel } from "@/lib/recommendation";

interface Profile {
  user_id: string;
  role: "client" | "provider" | "admin";
  name?: string;
  email: string;
  phone?: string;
  area_name?: string;
  base_area_name?: string;
  service_type?: string;
  hourly_rate_ksh?: number;
  rating?: number;
  review_count?: number;
  completion_rate?: number;
  experience_years?: number;
  is_verified?: boolean;
  lat?: number; // saved home (client) / base (provider) location (#73)
  lng?: number;
  member_since?: string;
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" });
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="mt-1 text-base text-stone-900">{value ?? "—"}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { auth, checked } = useAuthGuard(["client", "provider", "admin"]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!checked || !auth) return;
    fetch(`${API_BASE_URL}/profile?user_id=${encodeURIComponent(auth.user_id)}`)
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((data: Profile) => setProfile(data))
      .catch(() => setError("Could not load your profile right now."))
      .finally(() => setLoading(false));
  }, [checked, auth]);

  if (!checked) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-stone-900">My Profile</h1>
          <p className="mt-1 text-base text-stone-500">Your account details.</p>
        </div>
        <div className="group relative inline-block">
          <button
            type="button"
            disabled
            aria-label="Edit Profile (coming soon)"
            className="cursor-not-allowed rounded-md border border-stone-200 bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-400"
          >
            Edit Profile
          </button>
          <span className="pointer-events-none absolute right-0 top-full mt-1 whitespace-nowrap rounded bg-stone-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            Coming soon
          </span>
        </div>
      </div>

      {loading && <p className="text-base text-stone-500">Loading your profile...</p>}

      {!loading && error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && profile && (
        <div className="rounded-lg border border-stone-200 bg-white p-8">
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Never show a placeholder name -- just omit the row if there isn't one (e.g. admin) */}
            {profile.name && <Field label="Name" value={profile.name} />}
            <Field label="Email" value={profile.email} />

            {profile.role === "client" && (
              <>
                <Field label="Phone" value={profile.phone} />
                <Field label="Area" value={profile.area_name} />
              </>
            )}

            {profile.role === "provider" && (
              <>
                <Field label="Phone" value={profile.phone} />
                <Field label="Base Area" value={profile.base_area_name} />
                <Field label="Service Type" value={profile.service_type} />
                <Field
                  label="Hourly Rate"
                  value={profile.hourly_rate_ksh != null ? `KES ${profile.hourly_rate_ksh.toLocaleString()}` : undefined}
                />
                <Field label="Rating" value={ratingLabel(profile.rating ?? null, profile.review_count)} />
                <Field
                  label="Completion Rate"
                  value={profile.completion_rate != null ? `${Math.round(profile.completion_rate * 100)}%` : undefined}
                />
                <Field
                  label="Experience"
                  value={profile.experience_years != null ? `${profile.experience_years} years` : undefined}
                />
                <Field label="Verified" value={profile.is_verified ? "Yes" : "Not yet verified"} />
              </>
            )}

            {profile.role === "admin" && <Field label="Role" value="Administrator" />}

            <Field label="Member Since" value={formatDate(profile.member_since)} />
          </dl>
        </div>
      )}

      {profile && profile.role !== "admin" && (
        <SavedLocation profile={profile} onSaved={setProfile} />
      )}
    </div>
  );
}

function SavedLocation({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const isClient = profile.role === "client";
  const areaName = isClient ? profile.area_name : profile.base_area_name;
  const hasPoint = typeof profile.lat === "number" && typeof profile.lng === "number";
  const [editing, setEditing] = useState(false);
  const [point, setPoint] = useState<LatLng | null>(
    hasPoint ? { lat: profile.lat as number, lng: profile.lng as number } : null,
  );
  const [located, setLocated] = useState<LocateResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!point || !located?.covered) {
      setError("Set a pin inside the area NaiServe covers first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/profile/location?user_id=${encodeURIComponent(profile.user_id)}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: point.lat, lng: point.lng }) },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(data));
        return;
      }
      onSaved(data as Profile);
      setEditing(false);
      setSaved(true);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-8" aria-labelledby="saved-location-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="saved-location-heading" className="font-heading text-xl font-semibold text-stone-900">
            {isClient ? "Home location" : "Base location"}
          </h2>
          {hasPoint ? (
            <p className="mt-1 text-sm text-stone-600" data-testid="saved-location">
              Exact location saved, near {areaName} ({(profile.lat as number).toFixed(5)},{" "}
              {(profile.lng as number).toFixed(5)}).
            </p>
          ) : (
            <p className="mt-1 text-sm text-stone-600" data-testid="saved-location">
              No exact location saved. {isClient ? "Recommendations" : "Your distance to clients"} currently
              use the centre of {areaName ?? "your area"}, which can be a kilometre or more off.
            </p>
          )}
          {saved && <p className="mt-1 text-sm text-teal-700">Location saved.</p>}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setSaved(false);
            }}
            className="shrink-0 rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            {hasPoint ? "Update location" : "Set exact location"}
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-6 space-y-4">
          <LocationField
            label={isClient ? "Your home location" : "Your base location"}
            point={point}
            onPointChange={setPoint}
            onLocated={setLocated}
          />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save location"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
