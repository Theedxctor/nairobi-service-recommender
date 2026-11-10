import { test, expect, request } from "@playwright/test";
import { API, PASSWORD, RECOMMEND_BODY, createClient, createProvider, login, retireProvider, verificationToken, verifyEmail, waitForRequestForm } from "./fixtures";

// #95: a password account must verify its email before booking; an unverified
// provider is not offered. Tests have no mailbox, so the link's token comes
// from the API's test-only endpoint and is then opened like the emailed link.

test("a new password account is asked to verify, cannot book until it does, then can", async ({ page }) => {
  const email = `e2e+verify${Date.now()}@naiserve.test`;
  const provider = await createProvider();
  const api = await request.newContext();
  try {
    // Sign up with email and password.
    await page.goto("/register");
    await page.fill("#fullName", "E2E Unverified");
    await page.fill("#phone", "0700000009");
    await page.fill("#email", email);
    await page.fill("#password", PASSWORD);
    await page.fill("#confirmPassword", PASSWORD);
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.waitForURL("**/login");
    await expect(page.getByText("Account created.")).toBeVisible();
    await expect(page.getByText("will need to verify before booking or accepting jobs")).toBeVisible();
    await expect(page.locator("#email")).toHaveValue(email);

    // Logging in works; a banner says what is still needed.
    await page.fill("#password", PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL(/dashboard/);
    const banner = page.getByRole("status", { name: "Verify your email" });
    await expect(banner).toContainText("Verify your email to book a provider");
    await expect(banner).toContainText(email);
    const account = await (await api.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json();
    expect(account.email_verified).toBe(false);

    // Asking for the link again straight away is rate limited.
    await banner.getByRole("button", { name: "Send the link again" }).click();
    await expect(banner.getByRole("alert")).toContainText("Please wait");

    // Browsing works, booking does not.
    await page.goto("/request");
    await waitForRequestForm(page);
    await page.selectOption("#serviceType", "plumber");
    await page.selectOption("#clientArea", "Kilimani");
    await page.selectOption("#timeSlot", "midday");
    await page.click("button[type=submit]");
    await page.waitForURL("**/results");
    const bookingPath = await page.locator('a[href^="/booking?provider="]').first().getAttribute("href");
    await page.goto(bookingPath!);
    await page.click("text=Send booking request");
    await expect(page.getByRole("alert").filter({ hasText: "Verify your email address before making a booking" })).toBeVisible();
    const direct = await api.post(`${API}/bookings`, {
      data: { client_id: account.client_id, provider_id: provider.providerId, ...RECOMMEND_BODY },
    });
    expect(direct.status()).toBe(403);
    expect(await (await api.get(`${API}/bookings?client_id=${account.client_id}`)).json()).toEqual([]);

    // Open the verification link.
    const token = await verificationToken(account.user_id);
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
    await page.getByRole("link", { name: "Continue" }).click();
    await page.waitForURL(/dashboard/);
    await expect(page.getByText("Welcome")).toBeVisible();
    await expect(banner).toHaveCount(0);
    expect((await (await api.get(`${API}/profile?user_id=${account.user_id}`)).json()).email_verified).toBe(true);

    // The link works once.
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole("heading", { name: "We couldn't verify this link" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "already been used" })).toBeVisible();

    // Booking now goes through.
    await page.goto(bookingPath!);
    await page.click("text=Send booking request");
    await page.waitForURL("**/booking?id=*");
    const id = Number(new URL(page.url()).searchParams.get("id"));
    await api.patch(`${API}/bookings/${id}/status`, { data: { status: "cancelled", actor: "client", actor_id: account.client_id } });
    console.log(`Live verification evidence: ${account.user_id} booking refused with 403 while unverified, booking #${id} created after verifying`);
  } finally {
    await api.dispose();
    await retireProvider(provider);
  }
});

test("an unverified provider is told to verify and is not offered to clients until they do", async ({ page }) => {
  const client = await createClient();
  const provider = await createProvider({ service_type: "carpenter", name: "E2E Unverified Carpenter" }, false);
  const api = await request.newContext();
  const search = { ...RECOMMEND_BODY, service_type: "carpenter", top_n: 1000 };
  const offered = async () => {
    const res = await api.post(`${API}/recommend`, { data: search });
    return res.ok() ? ((await res.json()) as { provider_id: string }[]).some((p) => p.provider_id === provider.providerId) : false;
  };
  try {
    await login(page, provider.email, provider.password);
    await expect(page.getByRole("status", { name: "Verify your email" })).toContainText("receive and accept jobs");
    expect(await offered()).toBe(false);
    const refused = await api.post(`${API}/bookings`, {
      data: { client_id: client.clientId, provider_id: provider.providerId, ...RECOMMEND_BODY },
    });
    expect(refused.status()).toBe(409);

    await verifyEmail(provider.userId);
    expect(await offered()).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByRole("status", { name: "Verify your email" })).toHaveCount(0);
  } finally {
    await api.dispose();
    await retireProvider(provider);
  }
});

test("Google sign-in is hidden when the server has no Google client ID", async ({ page }) => {
  await page.route("**/auth/config", (route) => route.fulfill({ json: { google_client_id: null } }));
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("google-sign-in")).toHaveCount(0);
});

test("a new Google user is taken to a register form with no email or password fields (Google stubbed)", async ({ page }) => {
  // Google's script and the API's answers are replaced here: a real Google
  // token needs a person and a Google account. The API's own handling of
  // tokens is covered by tests/ml-service/test_api_verification.py.
  await page.route("**/auth/config", (route) => route.fulfill({ json: { google_client_id: "stub.apps.googleusercontent.com" } }));
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google = { accounts: { id: {
        initialize(options) { window.__googleCallback = options.callback; window.__googleClientId = options.client_id; },
        renderButton(parent) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Continue with Google";
          button.onclick = () => window.__googleCallback({ credential: "stub-credential" });
          parent.appendChild(button);
        },
      } } };`,
    }),
  );
  let sentCredential: string | undefined;
  await page.route("**/auth/google", async (route) => {
    sentCredential = route.request().postDataJSON().credential;
    await route.fulfill({ json: { registered: false, email: "new.user@gmail.com", name: "New User" } });
  });

  await page.goto("/login");
  await page.getByTestId("google-sign-in").getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL("**/register");
  expect(sentCredential).toBe("stub-credential");
  // The button was set up with the client ID the API reported.
  expect(await page.evaluate(() => (window as unknown as { __googleClientId?: string }).__googleClientId)).toBe("stub.apps.googleusercontent.com");
  await expect(page.getByRole("status")).toContainText("Signing up with Google as new.user@gmail.com");
  await expect(page.locator("#fullName")).toHaveValue("New User");
  await expect(page.locator("#email")).toHaveCount(0);
  await expect(page.locator("#password")).toHaveCount(0);
  await expect(page.locator("#phone")).toBeVisible();

  // The form posts the Google token instead of an email and password.
  let registerBody: Record<string, unknown> | undefined;
  await page.route("**/auth/register", async (route) => {
    registerBody = route.request().postDataJSON();
    await route.fulfill({ status: 401, json: { detail: "Google sign-in could not be verified. Please try again." } });
  });
  await page.fill("#phone", "0700000010");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByText("Your Google sign-in expired")).toBeVisible();
  expect(registerBody).toMatchObject({ google_credential: "stub-credential", role: "client", name: "New User" });
  expect(registerBody).not.toHaveProperty("password");
  expect(registerBody).not.toHaveProperty("email");

  // Backing out returns the ordinary form.
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
});
