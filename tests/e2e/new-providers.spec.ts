import { test, expect, request } from "@playwright/test";
import { API, createClient, createProvider, login, retireProvider, waitForRequestForm } from "./fixtures";

// #61: providers with no history rank below the top 10 and get their own
// "New on NaiServe" section. A carpenter is used so our fresh provider is the
// only new one for this search, and tests never book real accounts.
const BODY = { client_area: "Kilimani", service_type: "carpenter", time_slot: "midday", day_type: "weekday" };

test("New on NaiServe lists new providers outside the top 10 and they can be booked", async ({ page }) => {
  const client = await createClient();
  const provider = await createProvider({ service_type: "carpenter", name: "E2E New Carpenter" });
  const api = await request.newContext();
  try {
    await login(page, client.email, client.password);
    await page.goto("/request");
    await waitForRequestForm(page);
    await page.selectOption("#serviceType", BODY.service_type);
    await page.selectOption("#clientArea", BODY.client_area);
    await page.selectOption("#timeSlot", BODY.time_slot);
    await page.click("button[type=submit]");
    await page.waitForURL("**/results");

    const section = page.locator("section", { has: page.getByRole("heading", { name: "New on NaiServe" }) });
    await expect(section).toBeVisible();

    // UI section == API section, and nothing in it repeats the ranked top 10.
    const expected = await (await api.post(`${API}/recommend/new-providers`, { data: { ...BODY, limit: 2 } })).json();
    const shown = await section.locator("h2").filter({ hasNotText: "New on NaiServe" }).allInnerTexts();
    expect(shown).toEqual(expected.map((p: { name: string }) => p.name));
    expect(shown).toContain("E2E New Carpenter");
    const top10 = await (await api.post(`${API}/recommend`, { data: { ...BODY, top_n: 10 } })).json();
    const top10Ids = new Set(top10.map((p: { provider_id: string }) => p.provider_id));
    expect(expected.every((p: { provider_id: string; is_new: boolean }) => p.is_new && !top10Ids.has(p.provider_id))).toBe(true);

    // Bookable from the section, with the cold-start explanation carried through.
    await section.locator(`a[href="/booking?provider=${provider.providerId}"]`).click();
    await page.waitForURL(`**/booking?provider=${provider.providerId}`);
    await expect(page.getByText("new provider with no job history", { exact: false })).toBeVisible();
    await page.click("text=Send booking request");
    await page.waitForURL("**/booking?id=*");
    await expect(page.getByText("Pending").first()).toBeVisible();

    // Clean up the booking as the client.
    const id = Number(new URL(page.url()).searchParams.get("id"));
    const cancel = await api.patch(`${API}/bookings/${id}/status`, {
      data: { status: "cancelled", actor: "client", actor_id: client.clientId },
    });
    expect(cancel.ok()).toBeTruthy();
  } finally {
    await api.dispose();
    await retireProvider(provider);
  }
});
