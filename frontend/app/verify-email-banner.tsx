"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, NETWORK_ERROR_MESSAGE, apiErrorMessage } from "@/lib/api";
import type { NaiserveAuth } from "./use-auth-guard";

/** Shown across the app until the account's email is verified (#95). The
 * status is read from the API each time, so it clears as soon as the link is
 * used, even if that happened on another device. */
export default function VerifyEmailBanner({ auth, pathname }: { auth: NaiserveAuth | null; pathname: string }) {
  const [email, setEmail] = useState<string | null>(null); // set only while unverified
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const userId = auth && auth.role !== "admin" ? auth.user_id : null;

  useEffect(() => {
    if (!userId) {
      setEmail(null);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE_URL}/profile?user_id=${encodeURIComponent(userId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((profile) => {
        if (!cancelled && profile) setEmail(profile.email_verified ? null : profile.email);
      })
      .catch(() => {}); // unreachable API: pages show their own error
    return () => {
      cancelled = true;
    };
  }, [userId, pathname]);

  if (!userId || !email) return null;

  const resend = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setNote({ ok: false, text: apiErrorMessage(data) });
      } else if (data?.sent) {
        setNote({ ok: true, text: "Sent. Check your inbox and your spam folder." });
      } else {
        setNote({ ok: false, text: "The email could not be sent: email delivery is not set up on this server yet." });
      }
    } catch {
      setNote({ ok: false, text: NETWORK_ERROR_MESSAGE });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" aria-label="Verify your email" className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone-800">
          <span className="font-semibold">Verify your email to {auth?.role === "provider" ? "receive and accept jobs" : "book a provider"}.</span>{" "}
          We sent a link to <span className="[overflow-wrap:anywhere]">{email}</span>.
        </p>
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="shrink-0 self-start rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-800 hover:bg-amber-100 disabled:opacity-60 sm:self-auto"
        >
          {busy ? "Sending..." : "Send the link again"}
        </button>
      </div>
      {note && (
        <p role={note.ok ? "status" : "alert"} className={`mx-auto mt-2 max-w-5xl text-sm ${note.ok ? "text-teal-800" : "text-red-700"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
