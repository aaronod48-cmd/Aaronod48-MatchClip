// End-to-end check that each role lands on the right home screen and sees
// only what it should. Runs against a LOCAL Supabase only.
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
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures++;
};
const visible = (loc) => loc.first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
const gone = (loc) => loc.first().waitFor({ state: "hidden", timeout: 3000 }).then(() => true, () => false);

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function api(path, body, method = "POST") {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}
async function makeUser(name, role) {
  const user = await api("/auth/v1/admin/users", {
    email: `${name.toLowerCase()}.${stamp}@test.local`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name, account_type: role === "player" ? "player" : "parent" },
  });
  if (role === "coach" || role === "admin") {
    await api(`/rest/v1/profiles?id=eq.${user.id}`, { role }, "PATCH");
  }
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

// ----- Pretend people and data -----
const parent = await makeUser("Morgan", "parent");
const otherParent = await makeUser("Riley", "parent");
const player = await makeUser("Pat", "player");
const coach = await makeUser("Casey", "coach");
const admin = await makeUser("Alex", "admin");

const [sam, jess, kim] = await api("/rest/v1/players", [
  { first_name: `Sam${stamp % 1000}`, birth_year: 2016, team_name: "Under 10 Lions" },
  { first_name: `Jess${stamp % 1000}`, birth_year: 2012, team_name: null },
  { first_name: `Kim${stamp % 1000}`, birth_year: 2015, team_name: null },
]);
await api("/rest/v1/guardianships", [
  { guardian_id: parent.id, player_id: sam.id },
  { guardian_id: parent.id, player_id: jess.id },
  { guardian_id: otherParent.id, player_id: kim.id },
]);
await api("/rest/v1/consents", [
  { player_id: sam.id, guardian_id: parent.id, consent_version: "test" },
  { player_id: kim.id, guardian_id: otherParent.id, consent_version: "test" },
]);
await api("/rest/v1/coach_assignments", [
  { coach_id: coach.id, player_id: sam.id },
  { coach_id: coach.id, player_id: jess.id }, // no consent: must stay hidden
  { coach_id: admin.id, player_id: kim.id },
]);

const browser = await chromium.launch();
try {
  // Parent
  let p = await logIn(browser, parent);
  check(await visible(p.getByText("Hi Morgan")), "parent: greeted by name");
  check(await visible(p.getByRole("heading", { name: "My children" })), "parent: sees 'My children'");
  check(await visible(p.getByText(sam.first_name)), "parent: sees their child Sam");
  check(await visible(p.getByText("Consent given ✓")), "parent: Sam shows 'Consent given'");
  check(await visible(p.getByText("Consent needed")), "parent: Jess shows 'Consent needed'");
  check(await gone(p.getByText(kim.first_name)), "parent: does NOT see another family's child");
  check(await visible(p.getByRole("link", { name: "Add a child" })), "parent: 'Add a child' button is there");

  // Player
  p = await logIn(browser, player);
  check(await visible(p.getByRole("heading", { name: "My matches" })), "player: sees 'My matches'");
  check(await gone(p.getByText("My children")), "player: no parent section");

  // Coach
  p = await logIn(browser, coach);
  check(await visible(p.getByRole("heading", { name: "My players" })), "coach: sees 'My players'");
  check(await visible(p.getByText(sam.first_name)), "coach: sees assigned player with consent");
  check(await gone(p.getByText(jess.first_name)), "coach: does NOT see assigned child without consent");
  check(await gone(p.getByText(kim.first_name)), "coach: does NOT see unassigned child");

  // Admin
  p = await logIn(browser, admin);
  check(await visible(p.getByRole("heading", { name: "Accounts" })), "admin: sees the accounts list");
  check(await visible(p.getByText("Morgan")), "admin: list includes a parent");
  check(await visible(p.getByText("Casey")), "admin: list includes the coach");
  check(await visible(p.getByText("(you)")), "admin: own account is marked (you)");
  check(await visible(p.getByText("Players assigned to you as coach: 1")), "admin: counts players assigned to them");
  check(await gone(p.getByText("My children")), "admin: no parent section");
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
