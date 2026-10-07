"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { readAuth, useAuthGuard } from "../../../use-auth-guard";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Mirrors TIME_SLOT_RANGES in ml-service/feature_engineering.py.
const TIME_SLOTS = [
  { label: "Morning rush", range: "07:00–09:00" },
  { label: "Midday", range: "11:00–14:00" },
  { label: "Evening rush", range: "16:00–19:00" },
  { label: "Night", range: "21:00–05:00" },
  { label: "Weekend day", range: "09:00–18:00" },
];

interface Row {
  enabled: boolean;
  start: string;
  end: string;
}

const emptyRows = (): Record<string, Row> =>
  Object.fromEntries(DAYS.map((d) => [d, { enabled: false, start: "08:00", end: "17:00" }]));

export default function ProviderAvailabilityPage() {
  const { checked } = useAuthGuard(["provider"]);
  const [rows, setRows] = useState<Record<string, Row>>(emptyRows());
  const [loading, setLoading] = useState(true);
  const [hadSlots, setHadSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!checked) return;
    const providerId = readAuth()?.provider_id;
    if (!providerId) {
      setMessage({ ok: false, text: "No provider account found for this login." });
      setLoading(false);
      return;
    }
    fetch(`${API_BASE_URL}/providers/${encodeURIComponent(providerId)}/availability`)
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((data: { day_of_week: string; start_time: string; end_time: string }[]) => {
        const next = emptyRows();
        for (const s of data) {
          next[s.day_of_week] = { enabled: true, start: s.start_time, end: s.end_time };
        }
        setRows(next);
        setHadSlots(data.length > 0);
      })
      .catch(() => setMessage({ ok: false, text: "Could not load your availability right now." }))
      .finally(() => setLoading(false));
  }, [checked]);

  if (!checked) return null;

  const update = (day: string, patch: Partial<Row>) => {
    setMessage(null);
    setRows((r) => ({ ...r, [day]: { ...r[day], ...patch } }));
  };

  async function save() {
    const providerId = readAuth()?.provider_id;
    if (!providerId) return;
    const slots = DAYS.filter((d) => rows[d].enabled).map((d) => ({
      day_of_week: d,
      start_time: rows[d].start,
      end_time: rows[d].end,
    }));
    const bad = DAYS.find((d) => rows[d].enabled && rows[d].start >= rows[d].end);
    if (bad) {
      setMessage({ ok: false, text: `${bad}: start time must be before end time.` });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/providers/${encodeURIComponent(providerId)}/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      });
      if (!res.ok) throw new Error("save failed");
      setHadSlots(slots.length > 0);
      setMessage({ ok: true, text: "Availability saved." });
    } catch {
      setMessage({ ok: false, text: "Could not save your availability. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-semibold text-stone-900">Availability</h1>
        <p className="mt-2 text-base text-stone-500">
          Set the hours you work each week. Clients can only be matched with you during these hours.
        </p>
      </div>

      {!loading && !hadSlots && (
        <p className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
          You have not set any availability yet, so you will not appear in recommendations. Tick the
          days you work and save.
        </p>
      )}

      <div className="rounded-lg border border-stone-200 bg-white">
        <ul className="divide-y divide-stone-200">
          {DAYS.map((day) => (
            <li key={day} className="flex flex-wrap items-center gap-4 p-4">
              <label className="flex w-40 items-center gap-3 text-stone-900">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-teal-700"
                  checked={rows[day].enabled}
                  disabled={loading}
                  onChange={(e) => update(day, { enabled: e.target.checked })}
                />
                <span className="font-medium">{day}</span>
                <span className="sr-only">Available</span>
              </label>
              <input
                type="time"
                aria-label={`${day} start time`}
                value={rows[day].start}
                disabled={!rows[day].enabled}
                onChange={(e) => update(day, { start: e.target.value })}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-stone-900 disabled:bg-stone-100 disabled:text-stone-400"
              />
              <span className="text-stone-400">to</span>
              <input
                type="time"
                aria-label={`${day} end time`}
                value={rows[day].end}
                disabled={!rows[day].enabled}
                onChange={(e) => update(day, { end: e.target.value })}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-stone-900 disabled:bg-stone-100 disabled:text-stone-400"
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="text-sm text-stone-500">
        <p className="font-medium text-stone-700">Time slots clients book in</p>
        <ul className="mt-1 list-disc pl-5">
          {TIME_SLOTS.map((t) => (
            <li key={t.label}>
              {t.label}: {t.range}
            </li>
          ))}
        </ul>
        <p className="mt-1">Cover these hours to be recommended for that slot.</p>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving || loading}
          className="rounded-md bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save availability"}
        </button>
        {message && (
          <p role="status" className={message.ok ? "text-sm text-teal-700" : "text-sm text-red-600"}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
