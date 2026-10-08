import { test, expect } from "@playwright/test";
import { createClient, login, waitForRequestForm } from "./fixtures";

test("backend unreachable shows banner and Retry recovers", async ({ page }) => {
  const c = await createClient();
  await login(page, c.email, c.password);

  await page.route("**/localhost:8000/**", (r) => r.abort());
  await page.goto("/request");
  await expect(page.locator("[role=alert]").first()).toBeVisible();
  await expect(page.getByText("Retry")).toBeVisible();

  await page.unroute("**/localhost:8000/**");
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
