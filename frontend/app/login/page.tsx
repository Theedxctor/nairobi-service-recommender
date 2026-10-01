"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE_URL = "http://localhost:8000";

interface LoginResponse {
  user_id: string;
  role: "client" | "provider" | "admin";
  name?: string;
  client_id?: string;
  provider_id?: string;
}

const ROLE_REDIRECTS: Record<LoginResponse["role"], string> = {
  client: "/dashboard",
  provider: "/provider/dashboard",
  admin: "/admin/dashboard",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Login failed. Please try again.");
        return;
      }

      const auth = data as LoginResponse;
      // Storing in localStorage rather than React context: it survives a full
      // page refresh and doesn't require wiring an AuthProvider into the root
      // layout just for this step -- dashboards can read it directly later.
      localStorage.setItem("naiserve_auth", JSON.stringify(auth));

      router.push(ROLE_REDIRECTS[auth.role] ?? "/");
    } catch {
      setError("Could not reach the server. Please try again.");
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
            Good to see you again.
          </p>
          <p className="mt-4 max-w-sm text-teal-100/80">
            Log in to request a service or manage the bookings coming your way.
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
              Log in
            </h1>
            <p className="mt-2 text-base text-stone-500">
              Access your client or service provider account.
            </p>
          </div>

          {error && (
            <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-stone-700">
                Email
              </label>
              <input
                type="email"
                id="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:bg-stone-50 disabled:text-stone-400"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-stone-700">
                Password
              </label>
              <input
                type="password"
                id="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full rounded-md border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/30 disabled:bg-stone-50 disabled:text-stone-400"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-teal-700 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-teal-300"
            >
              {loading ? "Logging in..." : "Log In"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-stone-500">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-medium text-teal-700 hover:text-teal-800">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}


