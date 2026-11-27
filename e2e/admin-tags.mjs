// End-to-end check of the admin "Manage tags" screen. LOCAL only.
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
const visible = (loc, timeout = 8000) => loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
async function api(path, body, method = "POST") {
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
async function makeUser(name, role) {
  const u = await api("/auth/v1/admin/users", { email: `${name}.${stamp}@test.local`, password: PASSWORD, email_confirm: true, user_metadata: { display_name: name } });
  if (role !== "parent") await api(`/rest/v1/profiles?id=eq.${u.id}`, { role }, "PATCH");
  return u;
}
async function logIn(browser, email) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${APP}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("form button[type=submit] >> nth=0");
  await page.waitForURL(/\/dashboard/);
  return page;
}

const tagName = `Heading${stamp % 1000}`;
const admin = await makeUser("tagadmin", "admin");
const parent = await makeUser("tagparent", "parent");
const browser = await chromium.launch();
try {
  const a = await logIn(browser, admin.email);
  await a.getByRole("link", { name: /Manage tags/ }).click();
  await a.waitForURL(/\/admin\/tags/);
  check(await visible(a.getByRole("textbox", { name: "Name for 1v1 Attack" })), "the tag list is shown");

  await a.getByLabel("New tag name").fill(tagName);
  await a.getByRole("button", { name: "Add" }).click();
  check(await visible(a.getByText(`Added "${tagName}".`)), "admin adds a tag");
  await a.getByLabel("New tag name").fill("Shooting");
  await a.getByRole("button", { name: "Add" }).click();
  check(await visible(a.getByText("That name already exists.")), "duplicate names are refused");

  await a.reload();
  await a.getByRole("textbox", { name: `Name for ${tagName}` }).fill(`${tagName} duels`);
  await a.locator("li", { has: a.getByRole("textbox", { name: `Name for ${tagName}` }) }).getByRole("button", { name: "Save" }).click();
  check(await visible(a.getByText("Saved.")), "admin renames a tag");
  await a.reload();
  const renamed = `${tagName} duels`;
  const names = async () => {
    await a.getByRole("textbox", { name: `Name for ${renamed}` }).waitFor();
    return a.getByRole("textbox").evaluateAll((els) => els.map((e) => e.value));
  };
  const before = (await names()).indexOf(renamed);
  await a.getByRole("button", { name: `Move ${renamed} up` }).click();
  let moved = false;
  for (let i = 0; i < 10 && !moved; i++) {
    await a.waitForTimeout(500);
    await a.reload();
    moved = (await names()).indexOf(renamed) === before - 1;
  }
  check(moved, "admin moves a tag up the list");

  await a.getByRole("button", { name: `Hide ${renamed}` }).click();
  check(await visible(a.getByRole("button", { name: `Show ${renamed}` })), "admin hides a tag");
  const [row] = await api(`/rest/v1/tags?name=eq.${encodeURIComponent(renamed)}&select=is_active`, undefined, "GET");
  check(row.is_active === false, "the database marks it hidden");

  // ---- Score categories use the same screen ----
  await a.goto(`${APP}/dashboard`);
  await a.getByRole("link", { name: /Score categories/ }).click();
  await a.waitForURL(/\/admin\/score-categories/);
  check(await visible(a.getByRole("textbox", { name: "Name for Decision making" })), "the score categories list is shown");
  const cat = `Work rate ${stamp % 1000}`;
  await a.getByLabel("New score category name").fill(cat);
  await a.getByRole("button", { name: "Add" }).click();
  check(await visible(a.getByText(`Added "${cat}".`)), "admin adds a score category");
  const [row2] = await api(`/rest/v1/score_categories?name=eq.${encodeURIComponent(cat)}&select=is_active`, undefined, "GET");
  check(row2?.is_active === true, "the new category is saved");

  const p = await logIn(browser, parent.email);
  await p.goto(`${APP}/admin/tags`);
  check(await visible(p.getByText(/could not be found|404/i)), "a parent can't open Manage tags");
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
