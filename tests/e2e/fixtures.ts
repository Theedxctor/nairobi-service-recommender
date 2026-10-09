import { expect, request, type Page } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://localhost:8000";
export const PASSWORD = "E2eTest!2026";

export interface Account {
  email: string;
  password: string;
  userId: string;
  clientId?: string;
  providerId?: string;
}

let counter = 0;
const uniqueEmail = (kind: string) =>
  `e2e+${kind}${Date.now()}${counter++}@naiserve.test`;

async function registerAndLogin(body: Record<string, unknown>): Promise<Account> {
  const api = await request.newContext();
  try {
    const reg = await api.post(`${API}/auth/register`, { data: body });
    expect(reg.ok(), await reg.text()).toBeTruthy();
    const login = await api.post(`${API}/auth/login`, {
      data: { email: body.email, password: body.password },
    });
    expect(login.ok(), await login.text()).toBeTruthy();
    const j = await login.json();
    return {
      email: body.email as string,
      password: body.password as string,
      userId: j.user_id,
      clientId: j.client_id,
      providerId: j.provider_id,
    };
  } finally {
    await api.dispose();
  }
}

export const createClient = () =>
  registerAndLogin({
    email: uniqueEmail("client"),
    password: PASSWORD,
    role: "client",
    name: "E2E Client",
    phone: "0700000001",
    area_id: "A03",
  });

export async function createProvider(overrides: Record<string, unknown> = {}): Promise<Account> {
  const acct = await registerAndLogin({
    email: uniqueEmail("provider"),
    password: PASSWORD,
    role: "provider",
    name: "E2E Provider",
    phone: "0700000002",
    base_area_id: "A03",
    service_type: "plumber",
    hourly_rate_ksh: 900,
    ...overrides,
  });
  const api = await request.newContext();
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const res = await api.put(`${API}/providers/${acct.providerId}/availability`, {
    data: { slots: days.map((d) => ({ day_of_week: d, start_time: "08:00", end_time: "17:00" })) },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  await api.dispose();
  return acct;
}

/** Remove a test provider's availability so it is never recommended to real
 * users after the test (accounts and bookings are kept as a record). */
export async function retireProvider(acct: Account) {
  const api = await request.newContext();
  try {
    const res = await api.put(`${API}/providers/${acct.providerId}/availability`, { data: { slots: [] } });
    expect(res.ok(), await res.text()).toBeTruthy();
  } finally {
    await api.dispose();
  }
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/dashboard/);
}

export const RECOMMEND_BODY = {
  client_area: "Kilimani",
  service_type: "plumber",
  time_slot: "midday",
  day_type: "weekday",
};

export async function waitForRequestForm(page: Page) {
  await page.waitForSelector('#clientArea option[value="Kilimani"]', { state: "attached" });
}
