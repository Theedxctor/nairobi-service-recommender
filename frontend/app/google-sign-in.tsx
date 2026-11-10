"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/api";

// "Continue with Google" (#95). The button is Google's own (Google Identity
// Services). Clicking it gives this page an ID token: a signed statement of who
// the person is. The token is sent to our API, which checks Google's signature
// itself, so the browser is never trusted to say who signed in.
//
// The client ID comes from the API (GET /auth/config), so it is configured in
// one place. If the API has none, Google sign-in is off and nothing is shown.

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GoogleIdApi {
  initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

let scriptLoading: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptLoading) {
    scriptLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptLoading = null;
        reject(new Error("Google script failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptLoading;
}

export default function GoogleSignIn({
  onCredential,
  label = "continue_with",
}: {
  onCredential: (credential: string) => void;
  label?: "continue_with" | "signup_with" | "signin_with";
}) {
  const holder = useRef<HTMLDivElement>(null);
  const handler = useRef(onCredential);
  handler.current = onCredential;
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/auth/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((config) => {
        if (!cancelled && config?.google_client_id) setClientId(config.google_client_id);
      })
      .catch(() => {}); // API unreachable: the email form's own error covers it
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        const api = window.google?.accounts?.id;
        if (cancelled || !api || !holder.current) return;
        api.initialize({
          client_id: clientId,
          callback: (response) => response.credential && handler.current(response.credential),
        });
        api.renderButton(holder.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: label,
          logo_alignment: "center",
          width: Math.min(holder.current.offsetWidth || 320, 400),
        });
      })
      .catch(() => {}); // blocked or offline: the email form still works
    return () => {
      cancelled = true;
    };
  }, [clientId, label]);

  if (!clientId) return null;

  return (
    <div data-testid="google-sign-in">
      <div ref={holder} className="flex min-h-[44px] w-full justify-center" />
      <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-wide text-stone-400">
        <span className="h-px flex-1 bg-stone-200" />
        or
        <span className="h-px flex-1 bg-stone-200" />
      </div>
    </div>
  );
}
