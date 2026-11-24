// End-to-end check of adding a child with consent, withdrawing and giving
// consent again, and deleting. Runs against a LOCAL Supabase only.
// Needs SUPABASE_LOCAL_SECRET_KEY (the local demo key from `npx supabase status`).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://localhost:3000";
const API = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_LOCAL_SECRET_KEY;
if (!API.includes("127.0.0.1") && !API.includes("localhost")) throw new Error("Local Supabase only!");
if (!KEY) throw new Error("Set SUPABASE_LOCAL_SECRET_KEY (see docs/testing.md)");

const stamp = Date.now();
const PASSWORD = "goodpass123";
const childName = `Robin${stamp % 1000}`;
const childYear = new Date().getFullYear() - 9;
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures++;
};
const visible = (loc) => loc.first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function api(path, body, method = "POST") {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...headers, Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
async function makeUser(name, role) {
  const user = await api("/auth/v1/admin/users", {
    email: `${name.toLowerCase()}.${stamp}@test.local`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (role !== "parent") await api(`/rest/v1/profiles?id=eq.${user.id}`, { role }, "PATCH");
  return { id: user.id, email: user.email };
}
async function logIn(browser, who) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${APP}/login`);
  await page.fill("input[name=email]", who.email);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("form button[type=submit] >> nth=0");
  await page.waitForURL(/\/dashboard/);
  return page;
}

const parent = await makeUser("Jordan", "parent");
const otherParent = await makeUser("Quinn", "parent");
const coach = await makeUser("Drew", "coach");

const browser = await chromium.launch();
try {
  const p = await logIn(browser, parent);

  // ---- Add a child ----
  await p.getByRole("link", { name: "Add a child" }).click();
  await p.waitForURL(/\/children\/new/);
  await p.getByRole("button", { name: "Next: consent" }).click();
  check(await visible(p.getByText("Please enter your child's first name.")), "can't continue without a name");

  await p.getByLabel("Child's first name").fill(childName);
  await p.getByLabel("Year they were born").selectOption(String(childYear));
  await p.getByLabel("Team (optional)").fill("Under 10 Hawks");
  await p.getByRole("button", { name: "Next: consent" }).click();
  check(await visible(p.getByRole("heading", { name: `Your consent for ${childName}` })), "consent page uses the child's name");
  check(await visible(p.getByText("Nobody else. Videos and clips are private.")), "consent page explains who can see what");

  // Try to sneak past the tick-box (remove the browser's 'required' check).
  await p.locator("input[name=consentConfirmed]").evaluate((el) => el.removeAttribute("required"));
  await p.getByRole("button", { name: `I agree. Add ${childName}` }).click();
  check(await visible(p.getByText("Consent is needed to add a child.")), "database refuses a child without the consent tick");

  await p.check("input[name=consentConfirmed]");
  await p.getByRole("button", { name: `I agree. Add ${childName}` }).click();
  await p.waitForURL(/\/children\/[0-9a-f-]{36}\?added=1/);
  const childUrl = p.url().split("?")[0];
  const childId = childUrl.split("/").pop();
  check(await visible(p.getByText(`${childName} has been added`)), "child added, with a thank-you");
  check(await visible(p.getByText("Consent given ✓")), "child page shows 'Consent given'");
  check(await visible(p.getByText("wording v1-draft")), "child page shows which wording was agreed to");

  await p.goto(`${APP}/dashboard`);
  check(await visible(p.getByText(childName)), "child appears under 'My children'");

  // ---- Coach access follows consent ----
  await api("/rest/v1/coach_assignments", { coach_id: coach.id, player_id: childId });
  const c = await logIn(browser, coach);
  check(await visible(c.getByText(childName)), "assigned coach sees the child while consent is active");

  await p.goto(childUrl);
  await p.getByRole("button", { name: "Withdraw consent" }).click();
  await p.waitForURL(/withdrawn=1/);
  check(await visible(p.getByText("Coaches can no longer see")), "withdrawing consent is confirmed");
  await c.reload();
  check(await visible(c.getByText("No players are assigned to you yet.")), "coach loses access immediately after withdrawal");

  await p.getByRole("button", { name: "Read and give consent" }).click();
  await p.check("input[name=consentConfirmed]");
  await p.getByRole("button", { name: "I agree" }).click();
  await p.waitForURL(/consented=1/);
  await c.reload();
  check(await visible(c.getByText(childName)), "coach sees the child again after consent is given again");

  // ---- Another parent can't open the child's page ----
  const o = await logIn(browser, otherParent);
  await o.goto(childUrl);
  check(await visible(o.getByText(/could not be found|404/i)), "another parent gets 'not found' for this child's page");

  // ---- Delete ----
  await p.goto(childUrl);
  await p.getByRole("button", { name: /Delete .* and everything about them/ }).click();
  await p.check("input[name=confirmDelete]");
  await p.getByRole("button", { name: "Delete permanently" }).click();
  await p.waitForURL(/\/dashboard\?deleted=/);
  check(await visible(p.getByText(`${childName} and everything about them has been deleted.`)), "delete is confirmed");
  const left = await api(`/rest/v1/players?id=eq.${childId}&select=id`, undefined, "GET");
  const consentsLeft = await api(`/rest/v1/consents?player_id=eq.${childId}&select=id`, undefined, "GET");
  const assignmentsLeft = await api(`/rest/v1/coach_assignments?player_id=eq.${childId}&select=id`, undefined, "GET");
  check(left.length === 0 && consentsLeft.length === 0 && assignmentsLeft.length === 0,
    "the child, their consents and coach links are really gone from the database");
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
