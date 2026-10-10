import { test, expect, request } from "@playwright/test";
import { API, RECOMMEND_BODY, createClient, createProvider, login, retireProvider } from "./fixtures";

test("completed booking review persists, reaches provider, and updates recommendations", async ({ browser }) => {
  const client = await createClient();
  const provider = await createProvider();
  const api = await request.newContext();
  const clientContext = await browser.newContext();
  const providerContext = await browser.newContext();
  try {
    const created = await api.post(`${API}/bookings`, {
      data: { ...RECOMMEND_BODY, client_id: client.clientId, provider_id: provider.providerId },
    });
    expect(created.status(), await created.text()).toBe(201);
    const id = (await created.json()).booking_id;
    const page = await clientContext.newPage();
    await login(page, client.email, client.password);
    await page.goto("/dashboard/bookings");
    const card = page.locator("article", { hasText: `Booking #${id}` });
    await expect(card).toContainText("Pending");
    await expect(card.getByRole("button", { name: "Submit review" })).toHaveCount(0);
    for (const status of ["confirmed", "completed"]) {
      const res = await api.patch(`${API}/bookings/${id}/status`, {
        data: { status, actor: "provider", actor_id: provider.providerId },
      });
      expect(res.ok(), await res.text()).toBeTruthy();
    }
    await page.reload();
    await card.getByRole("combobox", { name: "Rating", exact: true }).selectOption("4");
    await card.getByLabel("Feedback (optional)").fill("Clear communication and a tidy repair.");

    // A network failure preserves the draft and permits retry.
    await page.route(`${API}/bookings/${id}/review`, (route) => route.abort());
    await card.getByRole("button", { name: "Submit review" }).click();
    await expect(card.getByRole("alert")).toBeVisible();
    await expect(card.getByLabel("Feedback (optional)")).toHaveValue("Clear communication and a tidy repair.");
    await page.unroute(`${API}/bookings/${id}/review`);
    await card.getByRole("button", { name: "Submit review" }).click();
    await expect(card).toContainText("Your review: 4/5");
    await page.reload();
    await expect(card).toContainText("Your review: 4/5");
    await expect(card.getByRole("button", { name: "Submit review" })).toHaveCount(0);

    const providerPage = await providerContext.newPage();
    await login(providerPage, provider.email, provider.password);
    await providerPage.goto("/provider/dashboard/jobs");
    const providerCard = providerPage.locator("article", { hasText: `Booking #${id}` });
    await expect(providerCard).toContainText("Client review: 4/5");
    await expect(providerCard).toContainText("Clear communication and a tidy repair.");
    await providerPage.goto("/profile");
    await expect(providerPage.getByText("★ 4.0 · 1 NaiServe review", { exact: true })).toBeVisible();

    const recommendations = await api.post(`${API}/recommend`, { data: { ...RECOMMEND_BODY, top_n: 500 } });
    expect(recommendations.ok(), await recommendations.text()).toBeTruthy();
    const ranked = (await recommendations.json()).find((p: { provider_id: string }) => p.provider_id === provider.providerId);
    expect(ranked.rating).toBe(4);
    expect(ranked.review_count).toBe(1);
    const duplicate = await api.post(`${API}/bookings/${id}/review`, { data: { client_id: client.clientId, rating: 1 } });
    expect(duplicate.status()).toBe(409);
    console.log(`Live review evidence: booking #${id}, rating=${ranked.rating}, review_count=${ranked.review_count}, duplicate=${duplicate.status()}`);
  } finally {
    await retireProvider(provider);
    await clientContext.close();
    await providerContext.close();
    await api.dispose();
  }
});
