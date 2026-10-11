import { test, expect, request } from "@playwright/test";
import { API, JOB_DATE, RECOMMEND_BODY, createClient, createProvider, login, retireProvider } from "./fixtures";

// #83: either party asks to move a booking to another date or time slot. The
// booking only changes when the other party accepts, and its predicted
// reliability is recomputed for the new slot.
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const local = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pretty = (s: string) => {
  const d = local(s);
  return `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const after = (from: string, wanted: (d: Date) => boolean) => {
  const d = local(from);
  do d.setDate(d.getDate() + 1); while (!wanted(d));
  return iso(d);
};
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
// Test providers work Monday to Friday.
const NEXT_WEEKDAY = after(JOB_DATE, (d) => !isWeekend(d));
const LATER_WEEKDAY = after(NEXT_WEEKDAY, (d) => !isWeekend(d));
const SATURDAY = after(JOB_DATE, (d) => d.getDay() === 6);

test("a booking is moved only when the other party accepts, with a recomputed score", async ({ browser }) => {
  const client = await createClient();
  const provider = await createProvider();
  const api = await request.newContext();
  const stored = async (id: number) => {
    const list = await (await api.get(`${API}/bookings?client_id=${client.clientId}`)).json();
    return list.find((b: { booking_id: number }) => b.booking_id === id);
  };

  try {
    const created = await api.post(`${API}/bookings`, {
      data: { client_id: client.clientId, provider_id: provider.providerId, ...RECOMMEND_BODY },
    });
    expect(created.status(), await created.text()).toBe(201);
    const original = await created.json();
    const id = original.booking_id as number;

    // --- Client asks to move it, in the browser ---
    const clientCtx = await browser.newContext();
    const clientPage = await clientCtx.newPage();
    await login(clientPage, client.email, client.password);
    await clientPage.goto("/dashboard/bookings");
    const mine = clientPage.locator("article", { hasText: `Booking #${id}` });
    await mine.getByRole("button", { name: "Reschedule" }).click();
    const send = mine.getByRole("button", { name: "Send request" });
    // Opens on the current date and slot, which is not a change.
    await expect(send).toBeDisabled();

    // A day the provider does not work is refused by the API, and nothing is stored.
    await mine.getByLabel("New date").fill(SATURDAY);
    await mine.getByLabel("New time slot").selectOption("weekend_day");
    await send.click();
    await expect(mine.getByRole("alert")).toContainText("not available");
    expect((await stored(id)).reschedule).toBeNull();

    await mine.getByLabel("New date").fill(NEXT_WEEKDAY);
    await mine.getByLabel("New time slot").selectOption("evening_rush");
    await send.click();
    await expect(mine).toContainText("You asked to move this booking to");
    await expect(mine).toContainText(pretty(NEXT_WEEKDAY));
    await expect(mine.getByRole("button", { name: "Reschedule" })).toHaveCount(0);

    // Nothing about the booking itself has changed yet.
    let now = await stored(id);
    expect(now).toMatchObject({ job_date: JOB_DATE, time_slot: "midday", reliability_score: original.reliability_score });
    expect(now.reschedule).toMatchObject({ proposed_by: "client", job_date: NEXT_WEEKDAY, time_slot: "evening_rush" });

    // --- Provider sees it and declines ---
    const providerCtx = await browser.newContext();
    const providerPage = await providerCtx.newPage();
    await login(providerPage, provider.email, provider.password);
    await providerPage.goto("/provider/dashboard/jobs");
    const job = providerPage.locator("article", { hasText: `Booking #${id}` });
    await expect(job).toContainText("The client asked to move this booking to");
    await expect(job).toContainText(pretty(NEXT_WEEKDAY));
    await job.getByRole("button", { name: "Keep current time" }).click();
    await expect(job).not.toContainText("asked to move");
    now = await stored(id);
    expect(now).toMatchObject({ job_date: JOB_DATE, time_slot: "midday", reschedule: null });

    // --- Provider proposes instead; the client cannot answer on the provider's behalf ---
    await job.getByRole("button", { name: "Reschedule" }).click();
    await job.getByLabel("New date").fill(LATER_WEEKDAY);
    await job.getByLabel("New time slot").selectOption("evening_rush");
    await job.getByRole("button", { name: "Send request" }).click();
    await expect(job).toContainText("You asked to move this booking to");
    const selfAccept = await api.patch(`${API}/bookings/${id}/reschedule`, {
      data: { actor: "provider", actor_id: provider.providerId, decision: "accept" },
    });
    expect(selfAccept.status()).toBe(403);

    // --- Client accepts: date, slot and score all change together ---
    await clientPage.reload();
    await expect(mine).toContainText("The provider asked to move this booking to");
    await mine.getByRole("button", { name: "Accept new time" }).click();
    await expect(mine).not.toContainText("asked to move");
    await expect(mine).toContainText(pretty(LATER_WEEKDAY));
    await expect(mine).toContainText("Evening Rush");

    now = await stored(id);
    expect(now).toMatchObject({ job_date: LATER_WEEKDAY, time_slot: "evening_rush", day_type: "weekday",
                                status: "pending", reschedule: null });
    const fresh = await (await api.post(`${API}/predict`, {
      data: { client_area: "Kilimani", provider_id: provider.providerId, time_slot: "evening_rush", job_date: LATER_WEEKDAY },
    })).json();
    expect(now.reliability_score).toBeCloseTo(fresh.reliability_score, 3);
    expect(now.reliability_score).not.toBe(original.reliability_score);
    await clientPage.goto(`/booking?id=${id}`);
    await expect(clientPage.getByText(pretty(LATER_WEEKDAY))).toBeVisible();

    // Both sides were notified along the way.
    const notes = async (userId: string) =>
      ((await (await api.get(`${API}/notifications?user_id=${userId}`)).json()) as { message: string }[]).map((n) => n.message);
    const toProvider = await notes(provider.userId);
    const toClient = await notes(client.userId);
    expect(toProvider.some((m) => m.includes(`asked to move booking #${id}`) && m.includes(pretty(NEXT_WEEKDAY)))).toBe(true);
    expect(toProvider.some((m) => m.includes("accepted your request") && m.includes(pretty(LATER_WEEKDAY)))).toBe(true);
    expect(toClient.some((m) => m.includes("declined your request") && m.includes(pretty(NEXT_WEEKDAY)))).toBe(true);
    expect(toClient.some((m) => m.includes(`asked to move booking #${id}`) && m.includes(pretty(LATER_WEEKDAY)))).toBe(true);

    // An open request is closed when the booking is cancelled, and a cancelled booking cannot be moved.
    const again = await api.post(`${API}/bookings/${id}/reschedule`, {
      data: { actor: "client", actor_id: client.clientId, job_date: NEXT_WEEKDAY, time_slot: "midday" },
    });
    expect(again.status(), await again.text()).toBe(201);
    const cancel = await api.patch(`${API}/bookings/${id}/status`, {
      data: { status: "cancelled", actor: "client", actor_id: client.clientId },
    });
    expect(cancel.ok()).toBeTruthy();
    expect((await cancel.json()).reschedule).toBeNull();
    const late = await api.post(`${API}/bookings/${id}/reschedule`, {
      data: { actor: "client", actor_id: client.clientId, job_date: NEXT_WEEKDAY, time_slot: "midday" },
    });
    expect(late.status()).toBe(409);

    await clientCtx.close();
    await providerCtx.close();
    console.log(
      `Live rescheduling evidence: booking #${id} ${JOB_DATE} midday (${original.reliability_score}) -> ` +
        `${LATER_WEEKDAY} evening_rush (${now.reliability_score}); declined ${NEXT_WEEKDAY}; self-accept=403`,
    );
  } finally {
    await api.dispose();
    await retireProvider(provider);
  }
});
