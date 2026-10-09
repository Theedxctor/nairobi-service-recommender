import { test, expect, request } from "@playwright/test";
import { API, PASSWORD, login, waitForRequestForm } from "./fixtures";

// #72/#73: exact client location, with emulated browser geolocation.
const KILIMANI = { latitude: -1.29, longitude: 36.785, accuracy: 25 };
const KISUMU = { latitude: -0.0917, longitude: 34.768, accuracy: 25 };

async function fillRegisterForm(page: import("@playwright/test").Page, email: string) {
  await page.goto("/register");
  await page.fill("#fullName", "E2E Located Client");
  await page.fill("#phone", "0700000077");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#confirmPassword", PASSWORD);
}

test("client signs up with exact location, requests from home, booking stores the point", async ({ browser }) => {
  const ctx = await browser.newContext({ permissions: ["geolocation"], geolocation: KILIMANI });
  const page = await ctx.newPage();
  const email = `e2e+located${Date.now()}@naiserve.test`;

  // Signup: share location -> labelled with the nearest area.
  await fillRegisterForm(page, email);
  await page.getByRole("button", { name: "Use my current location" }).click();
  await expect(page.getByTestId("location-area")).toHaveText("Near Kilimani");
  await page.getByRole("button", { name: "Create Account" }).click();
  await page.waitForURL("**/login");

  // Profile shows the saved exact point.
  await login(page, email, PASSWORD);
  await page.goto("/profile");
  await expect(page.getByTestId("saved-location")).toContainText("Exact location saved, near Kilimani (-1.29000, 36.78500)");

  // Request defaults to the saved home location.
  await page.goto("/request");
  await waitForRequestForm(page);
  await expect(page.getByLabel(/My saved home location \(near Kilimani\)/)).toBeChecked();
  await page.selectOption("#serviceType", "plumber");
  await page.selectOption("#timeSlot", "midday");
  await page.click("button[type=submit]");
  await page.waitForURL("**/results");
  await expect(page.getByText("near Kilimani (exact location)")).toBeVisible();

  // Ranked list == API scored from the same exact point.
  const api = await request.newContext();
  const body = { service_type: "plumber", time_slot: "midday", day_type: "weekday", top_n: 10,
                 client_lat: KILIMANI.latitude, client_lng: KILIMANI.longitude };
  const expected = (await (await api.post(`${API}/recommend`, { data: body })).json()).map((p: { name: string }) => p.name);
  expect(await page.locator("[aria-live=polite] h2").allInnerTexts()).toEqual(expected);

  // Booking stores the exact point; clean it up.
  await page.locator("[aria-live=polite]").getByRole("link", { name: "Select Provider" }).first().click();
  await page.click("text=Send booking request");
  await page.waitForURL("**/booking?id=*");
  const id = Number(new URL(page.url()).searchParams.get("id"));
  const loginRes = await (await api.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json();
  const bookings = await (await api.get(`${API}/bookings?client_id=${loginRes.client_id}`)).json();
  const b = bookings.find((x: { booking_id: number }) => x.booking_id === id);
  expect([b.client_lat, b.client_lng, b.client_area]).toEqual([KILIMANI.latitude, KILIMANI.longitude, "Kilimani"]);
  await api.patch(`${API}/bookings/${id}/status`, { data: { status: "cancelled", actor: "client", actor_id: loginRes.client_id } });
  await api.dispose();
  await ctx.close();
});

test("denied permission falls back to choosing an area", async ({ browser }) => {
  const ctx = await browser.newContext(); // no geolocation permission granted
  const page = await ctx.newPage();
  await fillRegisterForm(page, `e2e+denied${Date.now()}@naiserve.test`);
  await page.getByRole("button", { name: "Use my current location" }).click();
  await expect(page.getByText("Location permission was denied")).toBeVisible();
  await expect(page.locator("#areaId")).toBeEnabled();
  await page.selectOption("#areaId", "A20"); // Lavington
  await page.getByRole("button", { name: "Create Account" }).click();
  await page.waitForURL("**/login");
  await ctx.close();
});

test("a point outside coverage is flagged and not submitted", async ({ browser }) => {
  const ctx = await browser.newContext({ permissions: ["geolocation"], geolocation: KISUMU });
  const page = await ctx.newPage();
  await fillRegisterForm(page, `e2e+far${Date.now()}@naiserve.test`);
  await page.getByRole("button", { name: "Use my current location" }).click();
  await expect(page.getByText("outside the area NaiServe covers").first()).toBeVisible();
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByText("Your pin is outside the area NaiServe covers")).toBeVisible();
  expect(page.url()).toContain("/register");
  await ctx.close();
});
