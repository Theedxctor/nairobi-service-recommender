import { expect, request, test, type Page } from "@playwright/test";

import { API, createClient, login } from "./fixtures";

const ADMIN_AUTH = {
  user_id: "U-E2E-ADMIN",
  role: "admin",
  name: "E2E Administrator",
};

interface RetrainingFixture {
  status: "idle" | "queued" | "running" | "succeeded" | "failed";
  requested_by: string | null;
  requested_at: string | null;
  completed_at: string | null;
  message: string;
}

interface ProviderFixture {
  provider_id: string;
  name: string;
  service_type: string;
  base_area_name: string | null;
  phone: string | null;
  email: string | null;
  status: "pending" | "approved" | "rejected";
  is_verified: boolean;
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  registered_at: string | null;
}

const MODEL = {
  dataset: "synthetic",
  records: 3000,
  train_records: 2400,
  test_records: 600,
  trained_at: "2026-10-28T09:23:14Z",
  train: { rmse: 0.1316, mae: 0.1078, r2: 0.5056 },
  test: { rmse: 0.1417, mae: 0.116, r2: 0.4717 },
  cross_validation: {
    folds: 5,
    scope: "all synthetic records, shuffled KFold",
    rmse_mean: 0.1414,
    rmse_std: 0.002,
  },
};

const PLATFORM = {
  total_bookings: 154,
  pending_bookings: 11,
  confirmed_bookings: 4,
  completed_bookings: 46,
  cancelled_bookings: 93,
  total_providers: 292,
  verified_providers: 154,
  pending_verifications: 138,
  rejected_verifications: 0,
  reviews: 15,
  average_review_rating: 4.5,
  providers_loaded: 292,
  areas_loaded: 30,
};

const IDLE_RETRAINING: RetrainingFixture = {
  status: "idle",
  requested_by: null,
  requested_at: null,
  completed_at: null,
  message: "No retraining job has run in this API process.",
};

async function openAsAdmin(page: Page, path: string) {
  await page.addInitScript((auth) => {
    window.localStorage.setItem("naiserve_auth", JSON.stringify(auth));
  }, ADMIN_AUTH);
  await page.goto(path);
}

test("admin routes reject signed-out users and client accounts", async ({ page }) => {
  await page.goto("/admin/dashboard");
  await page.waitForURL("**/login");

  const client = await createClient();
  await login(page, client.email, client.password);
  await page.goto("/admin/verify-providers");
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();

  const api = await request.newContext();
  try {
    const response = await api.get(`${API}/admin/providers`, {
      params: { admin_user_id: client.userId },
    });
    expect(response.status()).toBe(403);
  } finally {
    await api.dispose();
  }
});

test("administrator monitors the platform and starts one retraining job", async ({ page }) => {
  let retraining = { ...IDLE_RETRAINING };
  let retrainRequests = 0;

  await page.route(`${API}/admin/overview?**`, async (route) => {
    await route.fulfill({ json: { platform: PLATFORM, model: MODEL, retraining } });
  });
  await page.route(`${API}/admin/model/retrain`, async (route) => {
    retrainRequests += 1;
    retraining = {
      status: "running",
      requested_by: ADMIN_AUTH.user_id,
      requested_at: "2026-11-10T10:00:00Z",
      completed_at: null,
      message: "Training and evaluation are in progress.",
    };
    await route.fulfill({ status: 202, json: retraining });
  });

  await openAsAdmin(page, "/admin/dashboard");

  await expect(page.getByRole("heading", { name: /Administration dashboard|Welcome back/ })).toBeVisible();
  await expect(page.getByText("154", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("0.1417", { exact: true })).toBeVisible();
  await expect(page.getByText(/5-fold validation RMSE 0\.1414/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Verify Provider Identity/ })).toContainText("138");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Retrain model" }).click();

  await expect(page.getByText("running", { exact: true })).toBeVisible();
  await expect(page.getByText("Training and evaluation are in progress.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retraining…" })).toBeDisabled();
  expect(retrainRequests).toBe(1);
});

test("administrator must explain a rejection and the provider moves to the rejected queue", async ({ page }) => {
  let provider: ProviderFixture = {
    provider_id: "P9000",
    name: "E2E Review Provider",
    service_type: "plumber",
    base_area_name: "Kilimani",
    phone: "0700000002",
    email: "provider@naiserve.test",
    status: "pending",
    is_verified: false,
    review_note: null as string | null,
    reviewed_at: null as string | null,
    reviewed_by: null as string | null,
    registered_at: "2026-11-10T08:00:00Z",
  };
  let reviewRequests = 0;

  await page.route(`${API}/admin/providers?**`, async (route) => {
    await route.fulfill({ json: [provider] });
  });
  await page.route(`${API}/admin/providers/${provider.provider_id}/verification`, async (route) => {
    reviewRequests += 1;
    const body = route.request().postDataJSON() as {
      admin_user_id: string;
      decision: string;
      note: string;
    };
    expect(body).toEqual({
      admin_user_id: ADMIN_AUTH.user_id,
      decision: "reject",
      note: "Phone contact could not be confirmed.",
    });
    provider = {
      ...provider,
      status: "rejected",
      review_note: body.note,
      reviewed_at: "2026-11-10T10:05:00Z",
      reviewed_by: ADMIN_AUTH.user_id,
    };
    await route.fulfill({ json: provider });
  });

  await openAsAdmin(page, "/admin/verify-providers");

  const card = page.locator("article").filter({ hasText: provider.name });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Add a review note before rejecting" }))
    .toBeVisible();
  expect(reviewRequests).toBe(0);

  await card.getByLabel(/Review note/).fill("Phone contact could not be confirmed.");
  await card.getByRole("button", { name: "Reject" }).click();

  await expect(page.getByText("No pending providers.")).toBeVisible();
  await page.getByRole("tab", { name: "Rejected (1)" }).click();
  await expect(page.getByText(provider.name)).toBeVisible();
  await expect(page.locator("p").filter({ hasText: "Previous note:" }))
    .toContainText("Phone contact could not be confirmed.");
  expect(reviewRequests).toBe(1);
});
