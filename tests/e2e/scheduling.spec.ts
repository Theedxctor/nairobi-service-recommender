import { test, expect, request } from "@playwright/test";
import { API, JOB_DATE, createClient, createProvider, login, retireProvider, waitForRequestForm } from "./fixtures";

// #82: a request is for a calendar date. Availability is checked for that
// date's weekday, and the date is stored on the booking and shown to both sides.
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
// The next weekday after JOB_DATE: same day type, different day of the week.
const OTHER_DATE = (() => {
  const d = local(JOB_DATE);
  do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
  return iso(d);
})();

test("a request is for a date: availability follows its weekday and the booking keeps it", async ({ browser }) => {
  const client = await createClient();
  // A carpenter, so this fresh provider is the only new one for the search.
  const provider = await createProvider({ service_type: "carpenter", name: "E2E Dated Carpenter" });
  const api = await request.newContext();
  const body = { client_area: "Kilimani", service_type: "carpenter", time_slot: "midday" };
  try {
    // The provider works only on JOB_DATE's day of the week.
    const workDay = DAYS[local(JOB_DATE).getDay()];
    const put = await api.put(`${API}/providers/${provider.providerId}/availability`, {
      data: { slots: [{ day_of_week: workDay, start_time: "08:00", end_time: "17:00" }] },
    });
    expect(put.ok(), await put.text()).toBeTruthy();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, client.email, client.password);
    const search = async (date: string) => {
      await page.goto("/request");
      await waitForRequestForm(page);
      await page.fill("#jobDate", date);
      await page.selectOption("#serviceType", "carpenter");
      await page.selectOption("#clientArea", "Kilimani");
      await page.selectOption("#timeSlot", "midday");
      await page.click("button[type=submit]");
      await page.waitForURL("**/results");
    };

    // The form will not offer a past date.
    await page.goto("/request");
    await waitForRequestForm(page);
    const today = iso(new Date());
    await expect(page.locator("#jobDate")).toHaveAttribute("min", today);
    await expect(page.getByText(`${workDay}: only providers who work ${workDay}s are shown`)).toBeVisible();

    // A different weekday: the provider does not work it, so is not offered...
    await search(OTHER_DATE);
    await expect(page.getByText(pretty(OTHER_DATE))).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recommended Providers" })).toBeVisible();
    const otherDay = await (await api.post(`${API}/recommend`, { data: { ...body, job_date: OTHER_DATE, top_n: 1000 } })).json();
    expect(otherDay.some((p: { provider_id: string }) => p.provider_id === provider.providerId)).toBe(false);
    await expect(page.locator(`a[href="/booking?provider=${provider.providerId}"]`)).toHaveCount(0);
    // ...and cannot be booked for it even by calling the API directly.
    const refused = await api.post(`${API}/bookings`, {
      data: { client_id: client.clientId, provider_id: provider.providerId, client_area: "Kilimani",
              time_slot: "midday", job_date: OTHER_DATE },
    });
    expect(refused.status()).toBe(409);

    // Their working day: offered, with the same score an undated weekday search gives.
    await search(JOB_DATE);
    await expect(page.getByText(pretty(JOB_DATE))).toBeVisible();
    const link = page.locator(`a[href="/booking?provider=${provider.providerId}"]`);
    await expect(link).toBeVisible();
    const dated = await (await api.post(`${API}/predict`, {
      data: { client_area: "Kilimani", provider_id: provider.providerId, time_slot: "midday", job_date: JOB_DATE },
    })).json();
    const undated = await (await api.post(`${API}/predict`, {
      data: { client_area: "Kilimani", provider_id: provider.providerId, time_slot: "midday", day_type: "weekday" },
    })).json();
    expect(dated.reliability_score).toBe(undated.reliability_score);

    // Book it: the date is on the review step, the confirmation, and in the database.
    await link.click();
    await page.waitForURL(`**/booking?provider=${provider.providerId}`);
    await expect(page.getByText(pretty(JOB_DATE))).toBeVisible();
    await page.click("text=Send booking request");
    await page.waitForURL("**/booking?id=*");
    const id = Number(new URL(page.url()).searchParams.get("id"));
    await page.reload();
    await expect(page.getByText(pretty(JOB_DATE))).toBeVisible();
    const stored = (await (await api.get(`${API}/bookings?client_id=${client.clientId}`)).json())
      .find((b: { booking_id: number }) => b.booking_id === id);
    expect(stored).toMatchObject({ job_date: JOB_DATE, day_type: "weekday", status: "pending" });
    await ctx.close();

    // The provider sees the date on the request and in the notification.
    const providerCtx = await browser.newContext();
    const providerPage = await providerCtx.newPage();
    await login(providerPage, provider.email, provider.password);
    await providerPage.goto("/provider/dashboard/jobs");
    await expect(providerPage.locator("article", { hasText: `Booking #${id}` })).toContainText(pretty(JOB_DATE));
    await providerCtx.close();
    const notes = ((await (await api.get(`${API}/notifications?user_id=${provider.userId}`)).json()) as { message: string }[])
      .map((n) => n.message);
    expect(notes.some((m) => m.includes(`booking #${id}`) && m.includes(pretty(JOB_DATE)))).toBe(true);

    // Past dates are refused by the API.
    const past = await api.post(`${API}/recommend`, { data: { ...body, job_date: "2020-01-06" } });
    expect(past.status()).toBe(422);

    const cancel = await api.patch(`${API}/bookings/${id}/status`, {
      data: { status: "cancelled", actor: "client", actor_id: client.clientId },
    });
    expect(cancel.ok()).toBeTruthy();
    console.log(`Live scheduling evidence: booking #${id} job_date=${stored.job_date} (${workDay}); ${OTHER_DATE} refused with 409`);
  } finally {
    await api.dispose();
    await retireProvider(provider);
  }
});
