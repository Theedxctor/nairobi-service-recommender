"use client";

import { useEffect, useState } from "react";
import { useAuthGuard } from "../../use-auth-guard";

const API_BASE_URL = "http://localhost:8000";

interface Notification {
  notification_id: number;
  user_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units: [string, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [label, secondsInUnit] of units) {
    const count = Math.floor(seconds / secondsInUnit);
    if (count >= 1) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export default function NotificationsPage() {
  const { auth, checked } = useAuthGuard(["client", "provider", "admin"]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!checked || !auth) return;
    fetch(`${API_BASE_URL}/notifications?user_id=${encodeURIComponent(auth.user_id)}`)
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((data: Notification[]) => setNotifications(data))
      .catch(() => setError("Could not load notifications right now."))
      .finally(() => setLoading(false));
  }, [checked, auth]);

  const markRead = async (notification: Notification) => {
    if (notification.is_read) return;

    // Optimistic update -- matches what a re-fetch would show, since this
    // endpoint always sets is_read=true unconditionally.
    setNotifications((prev) =>
      prev.map((n) => (n.notification_id === notification.notification_id ? { ...n, is_read: true } : n))
    );

    try {
      const res = await fetch(`${API_BASE_URL}/notifications/${notification.notification_id}/read`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("request failed");
    } catch {
      // Revert on failure so the UI doesn't lie about server state.
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === notification.notification_id ? { ...n, is_read: false } : n))
      );
    }
  };

  if (!checked) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-semibold text-stone-900">Notifications</h1>
        <p className="mt-1 text-base text-stone-500">Updates about your NaiServe account.</p>
      </div>

      {loading && <p className="text-base text-stone-500">Loading notifications...</p>}

      {!loading && error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && notifications.length === 0 && (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center">
          <p className="text-base text-stone-500">You have no notifications yet.</p>
        </div>
      )}

      {!loading && !error && notifications.length > 0 && (
        <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {notifications.map((notification) => (
            <button
              key={notification.notification_id}
              type="button"
              onClick={() => markRead(notification)}
              className="flex w-full items-start gap-3 p-5 text-left transition-colors hover:bg-stone-50"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.is_read ? "bg-transparent" : "bg-teal-700"}`}
                aria-hidden
              />
              <span className="flex-1">
                <span
                  className={`block text-sm ${
                    notification.is_read ? "font-normal text-stone-600" : "font-semibold text-stone-900"
                  }`}
                >
                  {notification.message}
                </span>
                <span className="mt-1 block text-xs text-stone-400">{timeAgo(notification.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

