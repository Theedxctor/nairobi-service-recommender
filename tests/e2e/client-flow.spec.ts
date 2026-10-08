import { test, expect, request } from "@playwright/test";
import { API, RECOMMEND_BODY, createClient, login, waitForRequestForm } from "./fixtures";

test("client request -> results -> booking -> cancel", async ({ page }) => {
  const client = await createClient();
  page.on("dialog", (d) => d.accept());
  await login(page, client.email, client.password);

  await page.goto("/request");
  await waitForRequestForm(page);
  await page.selectOption("#serviceType", "plumber");
  await page.selectOption("#clientArea", "Kilimani");
  await page.selectOption("#timeSlot", "midday");
  await page.click("button[type=submit]");
  await page.waitForURL("**/results");
  await page.waitForSelector("text=Select Provider");

  const names = await page.locator("h2").allInnerTexts();
  const api = await request.newContext();
  const rec = await api.post(`${API}/recommend`, { data: { ...RECOMMEND_BODY, top_n: 10 } });
  expect(rec.ok()).toBeTruthy();
  const expected = (await rec.json()).map((p: { name: string }) => p.name);
  expect(names).toEqual(expected);

  await page.locator("text=Select Provider").first().click();
  await page.waitForURL("**/booking?provider=*");
  await page.click("text=Send booking request");
  await page.waitForURL("**/booking?id=*");
  const id = Number(new URL(page.url()).searchParams.get("id"));
  expect(id).toBeGreaterThan(0);
  await expect(page.getByText("Pending").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Pending").first()).toBeVisible();

  const list = await (await api.get(`${API}/bookings?client_id=${client.clientId}`)).json();
  const b = list.find((x: { booking_id: number }) => x.booking_id === id);
  expect(b.status).toBe("pending");
  expect(typeof b.reliability_score).toBe("number");

  await page.goto("/dashboard/bookings");
  const card = page.locator("article", { hasText: `#${id}` });
  await card.getByRole("button", { name: "Cancel request" }).click();
  await expect
    .poll(async () => {
      const l = await (await api.get(`${API}/bookings?client_id=${client.clientId}`)).json();
      return l.find((x: { booking_id: number }) => x.booking_id === id)?.status;
    })
    .toBe("cancelled");
  await api.dispose();
});
