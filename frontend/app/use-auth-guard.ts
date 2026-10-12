"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type Role = "client" | "provider" | "admin";

export interface NaiserveAuth {
  user_id: string;
  role: Role;
  name?: string;
  client_id?: string;
  provider_id?: string;
  // As of the last login. Pages that need the current value ask the API.
  email_verified?: boolean;
}

const STORAGE_KEY = "naiserve_auth";

// A Google sign-in by someone with no NaiServe account yet (#95): kept for
// this tab only, while they choose a role and finish the register form.
const GOOGLE_PENDING_KEY = "naiserve_google_pending";
export interface PendingGoogle {
  credential: string;
  email: string;
  name?: string;
}

export function readPendingGoogle(): PendingGoogle | null {
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingGoogle) : null;
  } catch {
    return null;
  }
}

export function setPendingGoogle(pending: PendingGoogle | null) {
  try {
    if (pending) window.sessionStorage.setItem(GOOGLE_PENDING_KEY, JSON.stringify(pending));
    else window.sessionStorage.removeItem(GOOGLE_PENDING_KEY);
  } catch {
    // Storage blocked: they will be asked to click the Google button again.
  }
}

// Shown once on /login after a password registration.
const REGISTERED_KEY = "naiserve_just_registered";
export interface JustRegistered {
  email: string;
  emailSent: boolean;
}

export function takeJustRegistered(): JustRegistered | null {
  try {
    const raw = window.sessionStorage.getItem(REGISTERED_KEY);
    window.sessionStorage.removeItem(REGISTERED_KEY);
    return raw ? (JSON.parse(raw) as JustRegistered) : null;
  } catch {
    return null;
  }
}

export function setJustRegistered(value: JustRegistered) {
  try {
    window.sessionStorage.setItem(REGISTERED_KEY, JSON.stringify(value));
  } catch {
    // Only the notice is lost.
  }
}

export function storeAuth(auth: NaiserveAuth) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

/** POST /auth/google with a Google ID token. Returns the account, or the
 * Google identity of someone who still has to register. */
export async function exchangeGoogleCredential(apiBaseUrl: string, credential: string) {
  const res = await fetch(`${apiBaseUrl}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Google sign-in failed. Please try again.");
  return data as { registered: boolean; email: string; name?: string } & Partial<NaiserveAuth>;
}

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
 * Redirects to /login if there's no stored session, or to the user's own
 * home route if their role isn't in allowedRoles. `checked` flips to true
 * once the check has run and the page is safe to render.
 */
export function useAuthGuard(allowedRoles: Role[]) {
  const router = useRouter();
  const [auth, setAuth] = useState<NaiserveAuth | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const stored = readAuth();
    if (!stored) {
      router.replace("/login");
      return;
    }
    if (!allowedRoles.includes(stored.role)) {
      router.replace(ROLE_HOME[stored.role] ?? "/");
      return;
    }
    setAuth(stored);
    setChecked(true);
    // run once on mount -- allowedRoles is expected to be a stable literal per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { auth, checked };
}
