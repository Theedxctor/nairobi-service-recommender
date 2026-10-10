import { test, expect, request } from "@playwright/test";
import { API, RECOMMEND_BODY, createClient, createProvider, login, retireProvider } from "./fixtures";

// #81: a cancelled booking records who cancelled and why. A reason is required
// once a booking is confirmed, optional while it is still a pending request.
const REASON = "Called to an emergency at another site";

test("cancellation reasons are required after confirmation, stored, and shown to both sides", async ({ browser }) => {
  const client = await createClient();
  const provider = await createProvider();
  const api = await request.newContext();
  const book = async () => {
    const res = await api.post(`${API}/bookings`, {
      data: { client_id: client.clientId, provider_id: provider.providerId, ...RECOMMEND_BODY },
    });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()).booking_id as number;
  };
  const patch = (id: number, data: Record<string, unknown>) =>
    api.patch(`${API}/bookings/${id}/status`, { data });
  const stored = async (id: number) => {
    const list = await (await api.get(`${API}/bookings?client_id=${client.clientId}`)).json();
    return list.find((b: { booking_id: number }) => b.booking_id === id);
  };

  try {
    const confirmedId = await book();
    const declinedId = await book();
    const apiOnlyId = await book();

    // --- Provider, in the browser ---
    const providerCtx = await browser.newContext();
    const page = await providerCtx.newPage();
    await login(page, provider.email, provider.password);
    await page.goto("/provider/dashboard/jobs");

    const confirmed = page.locator("article", { hasText: `Booking #${confirmedId}` });
    await confirmed.getByRole("button", { name: "Accept" }).click();
    await expect(confirmed).toContainText("Confirmed");
    await confirmed.getByRole("button", { name: "Cancel", exact: true }).click();
    const submit = confirmed.getByRole("button", { name: "Confirm cancellation" });
    await expect(confirmed).toContainText("(required)");
    await expect(submit).toBeDisabled();
    await confirmed.getByRole("textbox").fill("   ");
    await expect(submit).toBeDisabled();

    // Backing out changes nothing.
    await confirmed.getByRole("button", { name: "Keep booking" }).click();
    expect((await stored(confirmedId)).status).toBe("confirmed");

    await confirmed.getByRole("button", { name: "Cancel", exact: true }).click();
    await confirmed.getByRole("textbox").fill(REASON);
    await confirmed.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(confirmed).toContainText("Cancelled by you");
    await expect(confirmed).toContainText(`Reason: ${REASON}`);

    // A pending request can be declined without a reason.
    const declined = page.locator("article", { hasText: `Booking #${declinedId}` });
    await declined.getByRole("button", { name: "Decline" }).click();
    await expect(declined).toContainText("(optional)");
    await declined.getByRole("button", { name: "Confirm decline" }).click();
    await expect(declined).toContainText("Cancelled by you");
    await expect(declined).toContainText("No reason was given.");
    await providerCtx.close();

    // --- What the database holds, read back through the API ---
    expect(await stored(confirmedId)).toMatchObject({
      status: "cancelled", cancelled_by: "provider", cancellation_reason: REASON,
    });
    expect(await stored(declinedId)).toMatchObject({
      status: "cancelled", cancelled_by: "provider", cancellation_reason: null,
    });
    const notes = ((await (await api.get(`${API}/notifications?user_id=${client.userId}`)).json()) as { message: string }[])
      .map((n) => n.message);
    expect(notes.some((m) => m.includes(`booking #${confirmedId}`) && m.endsWith(`Reason: ${REASON}`))).toBe(true);
    expect(notes.some((m) => m.includes(`declined your booking #${declinedId}`) && !m.includes("Reason:"))).toBe(true);

    // --- Client sees the same thing, after a fresh load ---
    const clientCtx = await browser.newContext();
    const clientPage = await clientCtx.newPage();
    await login(clientPage, client.email, client.password);
    await clientPage.goto("/dashboard/bookings");
    const mine = clientPage.locator("article", { hasText: `#${confirmedId}` });
    await expect(mine).toContainText("Cancelled by the provider");
    await expect(mine).toContainText(`Reason: ${REASON}`);
    await clientPage.goto(`/booking?id=${confirmedId}`);
    await expect(clientPage.getByText("Cancelled by the provider")).toBeVisible();
    await expect(clientPage.getByText(`Reason: ${REASON}`)).toBeVisible();

    // The client's own confirmed booking: the page will not send without a reason.
    expect((await patch(apiOnlyId, { status: "confirmed", actor: "provider", actor_id: provider.providerId })).ok()).toBe(true);
    await clientPage.goto("/dashboard/bookings");
    const own = clientPage.locator("article", { hasText: `#${apiOnlyId}` });
    await own.getByRole("button", { name: "Cancel booking" }).click();
    await expect(own.getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();

    // ...and the API refuses it even if the page is bypassed.
    const refused = await patch(apiOnlyId, { status: "cancelled", actor: "client", actor_id: client.clientId });
    expect(refused.status()).toBe(422);
    expect((await stored(apiOnlyId)).status).toBe("confirmed");

    await own.getByRole("textbox").fill("Plans changed");
    await own.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(own).toContainText("Cancelled by you");
    expect(await stored(apiOnlyId)).toMatchObject({
      status: "cancelled", cancelled_by: "client", cancellation_reason: "Plans changed",
    });
    await clientCtx.close();
    console.log(`Live cancellation evidence: bookings #${confirmedId} (provider, reason), #${declinedId} (declined, none), #${apiOnlyId} (client, reason; no-reason attempt=422)`);
  } finally {
    await api.dispose();
    await retireProvider(provider);
  }
});
