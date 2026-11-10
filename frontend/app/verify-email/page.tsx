"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { API_BASE_URL, NETWORK_ERROR_MESSAGE, apiErrorMessage } from "@/lib/api";
import { readAuth, ROLE_HOME, storeAuth } from "../use-auth-guard";

// Where the link in the verification email lands (#95). The token in the
// address is sent to the API once; the API marks the account verified.
type State =
  | { step: "checking" }
  | { step: "done"; next: string; signedIn: boolean }
  | { step: "failed"; message: string };

export default function VerifyEmailPage() {
  const [state, setState] = useState<State>({ step: "checking" });
  // A token works once, and React runs effects twice in development.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState({ step: "failed", message: "This link is incomplete. Open the link from your email again." });
      return;
    }
    fetch(`${API_BASE_URL}/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setState({ step: "failed", message: apiErrorMessage(data) });
          return;
        }
        const auth = readAuth();
        const signedIn = auth?.user_id === data.user_id;
        if (auth && signedIn) storeAuth({ ...auth, email_verified: true });
        setState({ step: "done", signedIn, next: auth && signedIn ? ROLE_HOME[auth.role] : "/login" });
      })
      .catch(() => setState({ step: "failed", message: NETWORK_ERROR_MESSAGE }));
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="font-heading text-xl font-semibold text-stone-900">
          Nai<span className="text-teal-700">Serve</span>
        </Link>

        {state.step === "checking" && (
          <p role="status" className="mt-10 text-base text-stone-500">
            Verifying your email...
          </p>
        )}

        {state.step === "done" && (
          <>
            <h1 className="mt-10 font-heading text-3xl font-semibold tracking-tight text-stone-900">Email verified</h1>
            <p className="mt-3 text-base text-stone-600">
              Thanks, your email address is confirmed. You can now use all of NaiServe.
            </p>
            <Link
              href={state.next}
              className="mt-8 inline-block rounded-md bg-teal-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
            >
              {state.signedIn ? "Continue" : "Log in"}
            </Link>
          </>
        )}

        {state.step === "failed" && (
          <>
            <h1 className="mt-10 font-heading text-3xl font-semibold tracking-tight text-stone-900">
              We couldn&apos;t verify this link
            </h1>
            <p role="alert" className="mt-3 text-base text-stone-600">
              {state.message}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              If you have already verified, just log in. Otherwise log in and choose &ldquo;Send the link again&rdquo;.
            </p>
            <Link
              href="/login"
              className="mt-8 inline-block rounded-md bg-teal-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
            >
              Go to log in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
