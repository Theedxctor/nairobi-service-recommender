import { test, expect, devices, type Page } from "@playwright/test";
import { createClient, login, waitForRequestForm } from "./fixtures";

// #93: NaiServe can be added to a phone's home screen and fits a phone screen.
const PHONE = { viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const IPHONE_SAFARI = devices["iPhone 13"].userAgent;

/** Pixels the page scrolls sideways; 0 means it fits the screen. */
const sidewaysOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("manifest, icons and mobile metadata make the site installable", async ({ page, request }) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0f766e");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /width=device-width/);
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(touchIcon!)).status()).toBe(200);

  const res = await request.get("/manifest.webmanifest");
  expect(res.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "NaiServe", short_name: "NaiServe", display: "standalone",
                                   start_url: "/dashboard", scope: "/", theme_color: "#0f766e" });

  // Every icon exists and really is the size the manifest claims.
  const purposes = new Set<string>();
  for (const icon of manifest.icons as { src: string; sizes: string; type: string; purpose: string }[]) {
    purposes.add(`${icon.purpose} ${icon.sizes}`);
    const size = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return `${img.naturalWidth}x${img.naturalHeight}`;
    }, icon.src);
    expect(size, icon.src).toBe(icon.sizes);
  }
  // What Chrome needs to offer installation, plus a maskable icon for Android.
  for (const needed of ["any 192x192", "any 512x512", "maskable 512x512"]) expect(purposes).toContain(needed);

  // Chrome's own verdict.
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors, JSON.stringify(installabilityErrors)).toEqual([]);
});

test("Android and desktop Chrome get an Install button that opens the browser prompt", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await page.goto("/login");
  const banner = page.getByRole("complementary", { name: "Install NaiServe" });
  await expect(page.locator("form")).toBeVisible();

  // Chrome fires this event when it judges the site installable; here it is
  // simulated, since a test browser never shows the real prompt.
  const fire = () =>
    page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>;
      event.prompt = () => {
        (window as unknown as { __prompted: number }).__prompted = ((window as unknown as { __prompted?: number }).__prompted ?? 0) + 1;
        return Promise.resolve();
      };
      event.userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  // Retried until the page's script is listening. Handling the event also
  // suppresses the browser's own mini-bar (defaultPrevented).
  await expect.poll(fire).toBe(true);
  await expect(banner).toContainText("Add NaiServe to your home screen");
  expect(await sidewaysOverflow(page)).toBe(0);
  await banner.getByRole("button", { name: "Install" }).click();
  await expect(banner).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);

  // "Not now" is remembered on later visits.
  await fire();
  await banner.getByRole("button", { name: "Not now" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(await fire()).toBe(false); // dismissed: the page no longer listens
  await expect(banner).toHaveCount(0);
  await ctx.close();
});

test("iPhone Safari gets Add to Home Screen steps, and nothing once installed", async ({ browser }) => {
  const ctx = await browser.newContext({ ...PHONE, userAgent: IPHONE_SAFARI });
  const page = await ctx.newPage();
  await page.goto("/login");
  const banner = page.getByRole("complementary", { name: "Install NaiServe" });
  await expect(banner).toContainText("Share");
  await expect(banner).toContainText("Add to Home Screen");
  await expect(banner.getByRole("button", { name: "Install" })).toHaveCount(0);
  await banner.getByRole("button", { name: "Got it" }).click();
  await page.reload();
  await expect(page.locator("form")).toBeVisible();
  await expect(banner).toHaveCount(0);
  await ctx.close();

  // Opened from the home screen: already installed, so no banner.
  const installed = await browser.newContext({ ...PHONE, userAgent: IPHONE_SAFARI });
  await installed.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  const app = await installed.newPage();
  await app.goto("/login");
  await expect(app.locator("form")).toBeVisible();
  await expect(app.getByRole("complementary", { name: "Install NaiServe" })).toHaveCount(0);
  await installed.close();
});

test("pages fit a 360px phone without sideways scrolling", async ({ browser }) => {
  const client = await createClient();
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();

  for (const path of ["/", "/login", "/register"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await sidewaysOverflow(page), path).toBe(0);
  }

  await login(page, client.email, client.password);
  // The mobile menu opens, lists the client's pages and navigates.
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "My Bookings" }).click();
  await page.waitForURL("**/dashboard/bookings");

  // /profile (long email) and /request (step indicator) used to overflow.
  for (const path of ["/dashboard", "/dashboard/bookings", "/notifications", "/profile"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await sidewaysOverflow(page), path).toBe(0);
  }
  await page.goto("/request");
  await waitForRequestForm(page);
  expect(await sidewaysOverflow(page), "/request").toBe(0);
  // Fields are 16px on phones, so iOS does not zoom in when one is focused.
  expect(await page.locator("#serviceType").evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");

  await page.selectOption("#serviceType", "plumber");
  await page.selectOption("#clientArea", "Kilimani");
  await page.selectOption("#timeSlot", "midday");
  await page.tap("button[type=submit]");
  await page.waitForURL("**/results");
  await expect(page.getByRole("heading", { name: "Recommended Providers" })).toBeVisible();
  expect(await sidewaysOverflow(page), "/results").toBe(0);
  // No control sticks out past the page's side padding (the sort menu once did).
  const widest = await page.evaluate(() =>
    Math.max(...[...document.querySelectorAll("main select, main input, main button")].map((el) => el.getBoundingClientRect().right)));
  expect(widest).toBeLessThanOrEqual(360 - 16);
  await page.locator('a[href^="/booking?provider="]').first().tap();
  await page.waitForURL("**/booking?provider=*");
  expect(await sidewaysOverflow(page), "/booking").toBe(0);
  await ctx.close();
});

test("offline: a page that cannot load shows the NaiServe offline page", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await page.goto("/login");
  // The service worker is only registered in a production build.
  const hasWorker = await page.evaluate(async () => {
    for (let i = 0; i < 20; i++) {
      if (await navigator.serviceWorker.getRegistration()) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  });
  test.skip(!hasWorker, "No service worker: this is a dev server (run against `next build && next start`).");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the worker

  await ctx.setOffline(true);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

  await ctx.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForURL("**/login"); // signed out, so /dashboard sends us to log in
  await expect(page.locator("form")).toBeVisible();
  await ctx.close();
});
