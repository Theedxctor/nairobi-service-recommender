import { test, expect } from "@playwright/test";
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

test("night slot shows no-provider message and stays on /request", async ({ page }) => {
  const c = await createClient();
  await login(page, c.email, c.password);
  await page.goto("/request");
  await waitForRequestForm(page);
  await page.selectOption("#serviceType", "plumber");
  await page.selectOption("#timeSlot", "night");
  await page.click("button[type=submit]");
  await expect(page.locator("p[role=alert]")).toContainText("No plumber is available");
  expect(page.url()).toContain("/request");
});
