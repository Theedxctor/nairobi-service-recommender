import { test, expect, request } from "@playwright/test";
import { API, RECOMMEND_BODY, createClient, createProvider, login, retireProvider } from "./fixtures";

test("provider accepts and completes a booking; notifications and cold-start explanation", async ({ browser }) => {
  const client = await createClient();
  const provider = await createProvider();
  try {
  const api = await request.newContext();

  // Book via the API so this spec targets exactly our provider (the UI path for
  // new providers is covered in new-providers.spec.ts).
  const res = await api.post(`${API}/bookings`, {
    data: { client_id: client.clientId, provider_id: provider.providerId, ...RECOMMEND_BODY },
  });
  expect(res.status(), await res.text()).toBe(201);
  const id = (await res.json()).booking_id as number;

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, provider.email, provider.password);
  await page.goto("/provider/dashboard/jobs");
  const card = page.locator("article", { hasText: `Booking #${id}` });
  await expect(card).toContainText("Pending");
  await card.getByRole("button", { name: "Accept" }).click();
  await expect(card).toContainText("Confirmed");
  await card.getByRole("button", { name: "Mark completed" }).click();
  await expect(card).toContainText("Completed");
  await ctx.close();

  const notes = async (uid: string) =>
    ((await (await api.get(`${API}/notifications?user_id=${uid}`)).json()) as { message: string }[]).map((n) => n.message);
  const providerMsgs = await notes(provider.userId);
  expect(providerMsgs.some((m) => m.includes("New request from E2E Client"))).toBeTruthy();
  const clientMsgs = await notes(client.userId);
  expect(clientMsgs.some((m) => m.includes("confirmed your"))).toBeTruthy();
  expect(clientMsgs.some((m) => m.includes("as completed"))).toBeTruthy();

  const pred = await api.post(`${API}/predict`, {
    data: { client_area: "Kilimani", provider_id: provider.providerId, time_slot: "midday", day_type: "weekday" },
  });
  expect(pred.ok()).toBeTruthy();
  expect((await pred.json()).explanation).toContain("new provider with no job history");
  await api.dispose();
  } finally {
    await retireProvider(provider);
  }
});
