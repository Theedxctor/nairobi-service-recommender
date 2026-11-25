"use client";

import { useEffect, useState } from "react";

import { API_BASE_URL } from "@/lib/api";

export type Role = "client" | "provider" | "admin";

export interface NaiserveAuth {
  user_id: string;
  role: Role;
  name?: string;
  client_id?: string;
  provider_id?: string;
  /** Signed session token from /auth/login. Required by the /admin endpoints. */
  token?: string;
}

const STORAGE_KEY = "naiserve_auth";

export const ROLE_HOME: Record<Role, string> = {
  client: "/dashboard",
  provider: "/provider/dashboard",
  admin: "/admin/dashboard",
};

export function readAuth(): NaiserveAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NaiserveAuth) : null;
  } catch {
    return null;
  }
}

export function clearAuth() {
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Calls an /admin endpoint with the session token. A 401 means the token is
 * missing or expired, so the stored session is cleared and the admin is sent
 * back to /login rather than left on a page full of errors.
 */
export async function adminFetch(auth: NaiserveAuth, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (auth.token) headers.set("Authorization", `Bearer ${auth.token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store", ...init, headers });
  if (response.status === 401) {
    clearAuth();
    window.location.replace("/login");
  }
  return response;
}

/**
 * Redirects to /login if there's no stored session, or to the user's own
 * home route if their role isn't in allowedRoles. `checked` flips to true
 * once the check has run and the page is safe to render.
 */
export function useAuthGuard(allowedRoles: Role[]) {
  const [auth, setAuth] = useState<NaiserveAuth | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const stored = readAuth();
    if (!stored) {
      window.location.replace("/login");
      return;
    }
    if (!allowedRoles.includes(stored.role)) {
      window.location.replace(ROLE_HOME[stored.role] ?? "/");
      return;
    }
    setAuth(stored);
    setChecked(true);
    // run once on mount -- allowedRoles is expected to be a stable literal per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { auth, checked };
}
