"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE_URL = "http://localhost:8000";

// Same Nairobi area list backing data/raw/nairobi_areas.csv, matching the
// area used on the service request form. area_id is what the API expects.
const NAIROBI_AREAS = [
  { id: "A01", name: "CBD" }, { id: "A02", name: "Westlands" }, { id: "A03", name: "Kilimani" },
  { id: "A04", name: "Karen" }, { id: "A05", name: "Langata" }, { id: "A06", name: "South B" },
  { id: "A07", name: "South C" }, { id: "A08", name: "Eastleigh" }, { id: "A09", name: "Parklands" },
  { id: "A10", name: "Upper Hill" }, { id: "A11", name: "Industrial Area" }, { id: "A12", name: "Embakasi" },
  { id: "A13", name: "Kasarani" }, { id: "A14", name: "Roysambu" }, { id: "A15", name: "Githurai" },
  { id: "A16", name: "Ruiru" }, { id: "A17", name: "Gigiri" }, { id: "A18", name: "Muthaiga" },
  { id: "A19", name: "Runda" }, { id: "A20", name: "Lavington" }, { id: "A21", name: "Kileleshwa" },
  { id: "A22", name: "Hurlingham" }, { id: "A23", name: "Spring Valley" }, { id: "A24", name: "Dagoretti" },
  { id: "A25", name: "Ngong" }, { id: "A26", name: "Rongai" }, { id: "A27", name: "Syokimau" },
  { id: "A28", name: "Kitengela" }, { id: "A29", name: "Kikuyu" }, { id: "A30", name: "Athi River" },
];

// Same service types listed on the request form's Service Type select.
const SERVICE_TYPES = ["Electrician", "Plumber", "Cleaner", "Technician", "Carpenter"];

type Role = "client" | "provider";

interface FormState {
  role: Role;
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  areaId: string;
  serviceType: string;
  hourlyRate: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    role: "client",
    fullName: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    areaId: NAIROBI_AREAS[2].id, // Kilimani, matches request form's default
    serviceType: SERVICE_TYPES[1], // Plumber
    hourlyRate: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};
    if (!form.fullName.trim()) nextErrors.fullName = "Full name is required.";
    if (!form.phone.trim()) nextErrors.phone = "Phone number is required.";

    if (!form.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!EMAIL_PATTERN.test(form.email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!form.password) {
      nextErrors.password = "Password is required.";
    } else if (form.password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    if (form.confirmPassword !== form.password) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    if (form.role === "provider") {
      const rate = Number(form.hourlyRate);
      if (!form.hourlyRate || Number.isNaN(rate) || rate <= 0) {
        nextErrors.hourlyRate = "Enter a valid hourly rate.";
      }
    }

    return nextErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload: Record<string, unknown> = {
      email: form.email.trim().toLowerCase(),
      password: form.password,
      role: form.role,
      name: form.fullName.trim(),
      phone: form.phone.trim(),
    };
    if (form.role === "client") {
      payload.area_id = form.areaId;
    } else {
      payload.base_area_id = form.areaId;
      payload.service_type = form.serviceType.toLowerCase();
      payload.hourly_rate_ksh = Number(form.hourlyRate);
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setApiError(data.detail || "Registration failed. Please try again.");
        return;
      }

      router.push("/login");
    } catch {
      setApiError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* Brand panel - desktop only, decorative */}
      <div className="relative hidden flex-col justify-between bg-teal-900 p-12 md:flex">
        <Link href="/" className="font-heading text-xl font-semibold text-white">
          Nai<span className="text-teal-300">Serve</span>
        </Link>
        <div>
          <p className="font-heading text-3xl font-semibold leading-snug text-white">
            Reliable help, matched to Nairobi&apos;s real conditions.
          </p>
          <p className="mt-4 max-w-sm text-teal-100/80">
            Every recommendation accounts for live traffic and a provider&apos;s actual arrival
            history, not just proximity.
          </p>
        </div>
        <p className="text-sm text-teal-200/60">&copy; {new Date().getFullYear()} NaiServe</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="font-heading text-xl font-semibold text-stone-900">
            Nai<span className="text-teal-700">Serve</span>
          </Link>

          <div className="mt-8">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-stone-900">
              Create an account
            </h1>
            <p className="mt-2 text-base text-stone-500">
              Register as a client to request services, or a provider to receive them.
            </p>
          </div>

          {apiError && (
            <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
            {/* Role */}
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                I am registering as:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`flex items-center justify-center rounded-md border p-3 text-sm font-medium transition-colors cursor-pointer ${
                    form.role === "client"
                      ? "border-teal-700 bg-teal-50 text-teal-800 ring-1 ring-teal-700"
                      : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value="client"
                    checked={form.role === "client"}
                    onChange={() => updateField("role", "client")}
                    disabled={loading}
                    className="sr-only"
                  />
                  <span>Client</span>
                </label>

                <label
                  className={`flex items-center justify-center rounded-md border p-3 text-sm font-medium transition-colors cursor-pointer ${
                    form.role === "provider"
                      ? "border-teal-700 bg-teal-50 text-teal-800 ring-1 ring-teal-700"
                      : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value="provider"
                    checked={form.role === "provider"}
                    onChange={() => updateField("role", "provider")}
                    disabled={loading}
                    className="sr-only"
                  />
                  <span>Service Provider</span>
                </label>
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-stone-700">
                Full Name
              </label>
              <input
                type="text"
                id="fullName"
                placeholder="e.g. Wanjiru Kamau"
                value={form.fullName}
                onChange={(e) => updateField("fullName", e.target.value)}
                disabled={loading}
                className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:bg-stone-50 disabled:text-stone-400"
              />
              {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>}
            </div>

            {/* Phone Number */}
            <div>
              <label htmlFor="phone" className="mb-1 block text-sm font-medium text-stone-700">
                Phone Number
              </label>
              <input
                type="tel"
                id="phone"
                placeholder="e.g. 0712 345 678"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                disabled={loading}
                className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:bg-stone-50 disabled:text-stone-400"
              />
              {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-stone-700">
                Email
              </label>
              <input
                type="email"
                id="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                disabled={loading}
                className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:bg-stone-50 disabled:text-stone-400"
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-stone-700">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                disabled={loading}
                className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:bg-stone-50 disabled:text-stone-400"
              />
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-stone-700">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={form.confirmPassword}
                onChange={(e) => updateField("confirmPassword", e.target.value)}
                disabled={loading}
                className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:bg-stone-50 disabled:text-stone-400"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>
              )}
            </div>

            {/* Area / Location (client) or Base Area (provider) */}
            <div>
              <label htmlFor="areaId" className="mb-1 block text-sm font-medium text-stone-700">
                {form.role === "client" ? "Area / Location" : "Base Area"}
              </label>
              <select
                id="areaId"
                value={form.areaId}
                onChange={(e) => updateField("areaId", e.target.value)}
                disabled={loading}
                className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:bg-stone-50 disabled:text-stone-400"
              >
                {NAIROBI_AREAS.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Provider-only fields */}
            {form.role === "provider" && (
              <>
                <div>
                  <label htmlFor="serviceType" className="mb-1 block text-sm font-medium text-stone-700">
                    Service Type
                  </label>
                  <select
                    id="serviceType"
                    value={form.serviceType}
                    onChange={(e) => updateField("serviceType", e.target.value)}
                    disabled={loading}
                    className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:bg-stone-50 disabled:text-stone-400"
                  >
                    {SERVICE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="hourlyRate" className="mb-1 block text-sm font-medium text-stone-700">
                    Hourly Rate (KES)
                  </label>
                  <input
                    type="number"
                    id="hourlyRate"
                    min={1}
                    placeholder="e.g. 900"
                    value={form.hourlyRate}
                    onChange={(e) => updateField("hourlyRate", e.target.value)}
                    disabled={loading}
                    className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:bg-stone-50 disabled:text-stone-400"
                  />
                  {errors.hourlyRate && <p className="mt-1 text-xs text-red-600">{errors.hourlyRate}</p>}
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-teal-700 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-teal-300"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-stone-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-teal-700 hover:text-teal-800">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}


