import { test, expect, request, type Page } from "@playwright/test";
import { API, RECOMMEND_BODY, createClient, login, waitForRequestForm } from "./fixtures";

// #79: filters run in the API over every available provider, so the list on
// screen must equal a filtered /recommend, not a filtered copy of the first 10.
interface Provider {
  name: string;
  hourly_rate_ksh: number;
}

const rankedNames = (page: Page) => page.locator("[aria-live=polite] h2").allInnerTexts();

test("results filters re-run the search, persist, and can be cleared", async ({ page }) => {
  const client = await createClient();
  const api = await request.newContext();
  const recommend = async (extra: Record<string, unknown> = {}): Promise<Provider[]> => {
    const res = await api.post(`${API}/recommend`, { data: { ...RECOMMEND_BODY, top_n: 10, ...extra } });
    expect(res.ok(), await res.text()).toBeTruthy();
    return res.json();
  };
  const names = (list: Provider[]) => list.map((p) => p.name);

  try {
    await login(page, client.email, client.password);
    await page.goto("/request");
    await waitForRequestForm(page);
    await page.selectOption("#serviceType", "plumber");
    await page.selectOption("#clientArea", "Kilimani");
    await page.selectOption("#timeSlot", "midday");
    await page.click("button[type=submit]");
    await page.waitForURL("**/results");
    await page.waitForSelector("text=Select Provider");

    const unfiltered = await recommend();
    expect(await rankedNames(page)).toEqual(names(unfiltered));

    // A limit that removes most of the cards on screen, so the filtered list
    // has to be filled from providers ranked 11th or lower.
    const limit = unfiltered.map((p) => p.hourly_rate_ksh).sort((a, b) => a - b)[2];
    const cheaper = await recommend({ max_hourly_rate_ksh: limit });
    expect(names(cheaper).some((n) => !names(unfiltered).includes(n))).toBe(true);
    await page.fill("#maxPrice", String(limit));
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect.poll(() => rankedNames(page)).toEqual(names(cheaper));
    expect(cheaper.every((p) => p.hourly_rate_ksh <= limit)).toBe(true);

    // All three together, still in the API's reliability order.
    const all = { max_hourly_rate_ksh: limit - 100, min_rating: 4, verified_only: true };
    const strict = await recommend(all);
    expect(strict.length).toBeGreaterThan(0);
    await page.fill("#maxPrice", String(all.max_hourly_rate_ksh));
    await page.selectOption("#minRating", "4");
    await page.check("#verifiedOnly");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect.poll(() => rankedNames(page)).toEqual(names(strict));
    const cards = page.locator("[aria-live=polite] > div");
    await expect(cards.filter({ hasText: "Verified" })).toHaveCount(strict.length);

    // The filtered search survives a refresh, controls included.
    await page.reload();
    await expect.poll(() => rankedNames(page)).toEqual(names(strict));
    await expect(page.locator("#maxPrice")).toHaveValue(String(all.max_hourly_rate_ksh));
    await expect(page.locator("#minRating")).toHaveValue("4");
    await expect(page.locator("#verifiedOnly")).toBeChecked();

    // Nothing matches: an honest message, and one click back to the full list.
    await page.fill("#maxPrice", "1");
    await page.getByRole("button", { name: "Apply filters" }).click();
    const empty = page.getByText("No available providers match these filters.");
    await expect(empty).toBeVisible();
    await expect(page.getByText("Select Provider")).toHaveCount(0);
    await empty.locator("..").getByRole("button", { name: "Clear filters" }).click();
    await expect.poll(() => rankedNames(page)).toEqual(names(unfiltered));
    await expect(page.locator("#maxPrice")).toHaveValue("");
    await expect(page.locator("#verifiedOnly")).not.toBeChecked();
  } finally {
    await api.dispose();
  }
});
