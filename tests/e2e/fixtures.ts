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

// Email verification (#95). Tests have no mailbox, so they ask the API's
// test-only endpoint for a token and then use the real /auth/verify-email.
// That endpoint only exists when the API runs with the same E2E_VERIFY_SECRET.
export const VERIFY_SECRET = process.env.E2E_VERIFY_SECRET ?? "local-e2e-secret";

export async function verificationToken(userId: string): Promise<string> {
  const api = await request.newContext();
  try {
    const res = await api.post(`${API}/auth/test/verification-token`, { data: { user_id: userId, secret: VERIFY_SECRET } });
    expect(res.ok(), `Start the API with E2E_VERIFY_SECRET=${VERIFY_SECRET} (got ${res.status()})`).toBeTruthy();
    return (await res.json()).token;
  } finally {
    await api.dispose();
  }
}

export async function verifyEmail(userId: string) {
  const token = await verificationToken(userId);
  const api = await request.newContext();
  try {
    const res = await api.post(`${API}/auth/verify-email`, { data: { token } });
    expect(res.ok(), await res.text()).toBeTruthy();
  } finally {
    await api.dispose();
  }
}

/** Verify an account that was created through the UI. */
export async function verifyEmailFor(email: string, password: string) {
  const api = await request.newContext();
  try {
    const res = await api.post(`${API}/auth/login`, { data: { email, password } });
    expect(res.ok(), await res.text()).toBeTruthy();
    await verifyEmail((await res.json()).user_id);
  } finally {
    await api.dispose();
  }
}

async function registerAndLogin(body: Record<string, unknown>, verified = true): Promise<Account> {
  const api = await request.newContext();
  try {
    const reg = await api.post(`${API}/auth/register`, { data: body });
    expect(reg.ok(), await reg.text()).toBeTruthy();
    if (verified) await verifyEmail((await reg.json()).user_id);
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

/** Accounts are created with a verified email unless `verified` is false. */
export const createClient = (verified = true) =>
  registerAndLogin({
    email: uniqueEmail("client"),
    password: PASSWORD,
    role: "client",
    name: "E2E Client",
    phone: "0700000001",
    area_id: "A03",
  }, verified);

export async function createProvider(overrides: Record<string, unknown> = {}, verified = true): Promise<Account> {
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
  }, verified);
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

// A weekday at least two days ahead (#82), so runs behave the same on any day
// of the week and near midnight. Test providers work Monday to Friday.
function nextWeekday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const JOB_DATE = nextWeekday();

export const RECOMMEND_BODY = {
  client_area: "Kilimani",
  service_type: "plumber",
  time_slot: "midday",
  day_type: "weekday",
  job_date: JOB_DATE,
};

/** Waits for the request form's options, then sets the job date to JOB_DATE
 * (the form defaults to today, which may be a weekend). */
export async function waitForRequestForm(page: Page) {
  await page.waitForSelector('#clientArea option[value="Kilimani"]', { state: "attached" });
  await page.fill("#jobDate", JOB_DATE);
}
