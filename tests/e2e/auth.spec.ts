import { test, expect } from "@playwright/test";
import { createClient, login, waitForRequestForm } from "./fixtures";

test("signed-out /request redirects to /login", async ({ page }) => {
  await page.goto("/request");
  await page.waitForURL("**/login");
});

test("signed-in client sees the sidebar on request, results and booking", async ({ page }) => {
  const c = await createClient();
  await login(page, c.email, c.password);

  const check = async () => {
    await expect(page.locator("aside")).toHaveCount(1);
    await expect(page.locator("aside nav a.bg-teal-50")).toHaveText(/Request a Service/);
    await expect(page.getByRole("link", { name: "Get Started" })).toHaveCount(0);
  };

  await page.click("aside >> text=Request a Service");
  await page.waitForURL("**/request");
  await waitForRequestForm(page);
  await check();

  await page.selectOption("#timeSlot", "midday");
  await page.click("button[type=submit]");
  await page.waitForURL("**/results");
  await page.waitForSelector("text=Select Provider");
  await check();

  await page.locator("text=Select Provider").first().click();
  await page.waitForSelector("text=Send booking request");
  await page.waitForURL("**/booking?provider=*");
  await check();
});
