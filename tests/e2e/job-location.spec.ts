import { test, expect, request } from "@playwright/test";
import {
  API, DIRECTIONS, JOB_DATE, RECOMMEND_BODY, createClient, createProvider, login, retireProvider, waitForRequestForm,
} from "./fixtures";

// #105: an area is not an address. Area-only bookings need directions; the
// provider sees the directions, the map pin and the client's phone only after
// accepting; the client then sees the provider's phone.
test("area-only booking needs directions, which reach the provider only after accepting", async ({ browser }) => {
  const client = await createClient(); // phone 0700000001
  // A carpenter, as in new-providers.spec.ts: few new providers compete for
  // the "New on NaiServe" slots, so ours is offered (phone 0700000002).
  const provider = await createProvider({ service_type: "carpenter", name: "E2E Location Carpenter" });
  const api = await request.newContext();
  try {
    // 1. Client: request for an area, pick our provider.
    const cctx = await browser.newContext();
    const cpage = await cctx.newPage();
    await login(cpage, client.email, client.password);
    await cpage.goto("/request");
    await waitForRequestForm(cpage);
    await cpage.selectOption("#serviceType", "carpenter");
    await cpage.selectOption("#clientArea", "Kilimani");
    await cpage.selectOption("#timeSlot", "midday");
    await cpage.click("button[type=submit]");
    await cpage.waitForURL("**/results");
    // A brand-new provider is offered in the "New on NaiServe" section (#61).
    await cpage.locator(`a[href="/booking?provider=${provider.providerId}"]`).first().click();
    await cpage.waitForURL(`**/booking?provider=${provider.providerId}`);
    await expect(cpage.getByText("Directions for the provider")).toBeVisible();
    await expect(cpage.getByText("(required)")).toBeVisible();

    // 2. Without directions nothing is sent.
    const before = (await (await api.get(`${API}/bookings?client_id=${client.clientId}`)).json()).length;
    await cpage.click("text=Send booking request");
    await expect(cpage.locator("p[role=alert]")).toContainText("Add directions for the provider");
    expect(cpage.url()).toContain("/booking?provider=");
    expect((await (await api.get(`${API}/bookings?client_id=${client.clientId}`)).json()).length).toBe(before);

    // 3. With directions the booking is created and shows them back to the client.
    await cpage.fill("#directions", `  ${DIRECTIONS}  `);
    await expect(cpage.getByText(`${DIRECTIONS.length + 4}/300`)).toBeVisible(); // counts what was typed
    await cpage.click("text=Send booking request");
    await cpage.waitForURL("**/booking?id=*");
    const id = Number(new URL(cpage.url()).searchParams.get("id"));
    await expect(cpage.getByText(DIRECTIONS)).toBeVisible();
    await expect(cpage.getByText("Provider phone")).toHaveCount(0); // not until accepted

    // 4. Provider, before accepting: only the area.
    const pctx = await browser.newContext();
    const ppage = await pctx.newPage();
    await login(ppage, provider.email, provider.password);
    await ppage.goto("/provider/dashboard/jobs");
    const card = ppage.locator("article", { hasText: `Booking #${id}` });
    await expect(card).toContainText("Kilimani");
    await expect(card).toContainText("appear here once you accept");
    await expect(card).not.toContainText(DIRECTIONS);
    await expect(card).not.toContainText("0700000001");

    // 5. Accept: directions and the client's phone appear (no map pin was shared).
    await card.getByRole("button", { name: "Accept" }).click();
    await expect(card).toContainText("Confirmed");
    await expect(card).toContainText(DIRECTIONS);
    await expect(card.getByRole("link", { name: "0700000001" })).toHaveAttribute("href", "tel:0700000001");
    await expect(card.getByRole("link", { name: /Google Maps/ })).toHaveCount(0);
    await ppage.reload(); // survives a refresh: it comes from the API, not local state
    await expect(card).toContainText(DIRECTIONS);
    await ppage.screenshot({ path: "test-results/job-location-provider-confirmed.png", fullPage: true });

    // 6. Client now sees the provider's phone.
    await cpage.goto("/dashboard/bookings");
    const ccard = cpage.locator("article", { hasText: `Booking #${id}` });
    await expect(ccard).toContainText("Confirmed");
    await expect(ccard.getByRole("link", { name: "0700000002" })).toHaveAttribute("href", "tel:0700000002");
    await cpage.screenshot({ path: "test-results/job-location-client-confirmed.png", fullPage: true });

    // 7. Completed: contact details are withdrawn on both sides.
    await card.getByRole("button", { name: "Mark completed" }).click();
    await expect(card).toContainText("Completed");
    await expect(card).not.toContainText("0700000001");
    await expect(card).not.toContainText(DIRECTIONS);
    await cpage.reload();
    await expect(ccard).not.toContainText("0700000002");
    console.log(`Live job-location evidence: booking #${id} directions shown after accept, hidden after completion`);
    await cctx.close();
    await pctx.close();
  } finally {
    await retireProvider(provider);
    await api.dispose();
  }
});

test("an exact point reaches the provider as a Google Maps link after accepting", async ({ browser }) => {
  const client = await createClient();
  const provider = await createProvider();
  const api = await request.newContext();
  try {
    const point = { client_lat: -1.2905, client_lng: 36.7836 };
    const created = await api.post(`${API}/bookings`, {
      data: { ...RECOMMEND_BODY, ...point, client_id: client.clientId, provider_id: provider.providerId, job_date: JOB_DATE },
    });
    expect(created.status(), await created.text()).toBe(201); // no directions needed with a point
    const id = (await created.json()).booking_id as number;

    // The API itself withholds the point from the provider until accepted.
    const pendingView = (await (await api.get(`${API}/bookings?provider_id=${provider.providerId}`)).json())
      .find((b: { booking_id: number }) => b.booking_id === id);
    expect(pendingView.client_lat).toBeNull();
    expect(pendingView.client_phone).toBeNull();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, provider.email, provider.password);
    await page.goto("/provider/dashboard/jobs");
    const card = page.locator("article", { hasText: `Booking #${id}` });
    await expect(card.getByRole("link", { name: /Google Maps/ })).toHaveCount(0);
    await card.getByRole("button", { name: "Accept" }).click();
    await expect(card).toContainText("Confirmed");
    const link = card.getByRole("link", { name: "Open the exact location in Google Maps" });
    await expect(link).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=-1.2905,36.7836");
    await expect(link).toHaveAttribute("target", "_blank");

    // Clean up: cancelling a confirmed booking needs a reason.
    const cancel = await api.patch(`${API}/bookings/${id}/status`, {
      data: { status: "cancelled", actor: "provider", actor_id: provider.providerId, reason: "E2E cleanup" },
    });
    expect(cancel.ok(), await cancel.text()).toBeTruthy();
    await ctx.close();
  } finally {
    await retireProvider(provider);
    await api.dispose();
  }
});
