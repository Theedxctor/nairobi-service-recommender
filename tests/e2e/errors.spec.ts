import { test, expect, request } from "@playwright/test";
import { API, createClient, login, waitForRequestForm } from "./fixtures";

test("backend unreachable shows banner and Retry recovers", async ({ page }) => {
  const c = await createClient();
  await login(page, c.email, c.password);

  // Block whichever backend this run targets (local or production).
  const apiPattern = `${API}/**`;
  await page.route(apiPattern, (r) => r.abort());
  await page.goto("/request");
  // Match the banner by its text: Next's route announcer is also a div[role=alert].
  await expect(page.getByRole("alert").filter({ hasText: "Could not reach" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  await page.unroute(apiPattern);
  await page.click("text=Retry");
  await waitForRequestForm(page);
  expect(await page.locator("#clientArea option").count()).toBeGreaterThan(1);
});

test("night is not offered: absent from the form and rejected by the API (#67)", async ({ page }) => {
  const c = await createClient();
  await login(page, c.email, c.password);
  await page.goto("/request");
  await waitForRequestForm(page);
  const slots = await page.locator("#timeSlot option").evaluateAll((os) =>
    os.map((o) => (o as HTMLOptionElement).value),
  );
  expect(slots).toEqual(["morning_rush", "midday", "evening_rush", "weekend_day"]);

  const api = await request.newContext();
  const res = await api.post(`${API}/recommend`, {
    data: { client_area: "Kilimani", service_type: "plumber", time_slot: "night", day_type: "weekday" },
  });
  expect(res.status()).toBe(422);
  await api.dispose();
});
