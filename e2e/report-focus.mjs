// End-to-end check of the report as a parent sees it, and "Set as my focus
// this week". FAKE video service (app runs with VIDEO_PROVIDER=fake). LOCAL only.
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
const gone = (loc) => loc.first().waitFor({ state: "hidden", timeout: 4000 }).then(() => true, () => false);
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
async function api(path, body, method = "POST") {
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
async function makeUser(name, role = "parent") {
  const u = await api("/auth/v1/admin/users", { email: `${name}.${stamp}@test.local`, password: PASSWORD, email_confirm: true, user_metadata: { display_name: name } });
  if (role !== "parent") await api(`/rest/v1/profiles?id=eq.${u.id}`, { role }, "PATCH");
  return u;
}
async function logIn(browser, email) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`${APP}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("form button[type=submit] >> nth=0");
  await page.waitForURL(/\/dashboard/);
  return page;
}
async function makeMatch(playerId, status, opponent) {
  const [m] = await api("/rest/v1/matches", [{ player_id: playerId, match_date: new Date().toISOString().slice(0, 10), opponent, team_shape: "4-4-2", kit_colour: "Red", shirt_number: 7, position: "RM", status, published_at: status === "published" ? new Date().toISOString() : null }]);
  return m;
}
async function makeReport(matchId, status, prefix) {
  const [r] = await api("/rest/v1/reports", [{ match_id: matchId, status, published_at: status === "published" ? new Date().toISOString() : null }]);
  await api("/rest/v1/report_scores", [
    { report_id: r.id, slot: 1, category_name: "Passing", score: 8 },
    { report_id: r.id, slot: 2, category_name: "Duels", score: 6 },
    { report_id: r.id, slot: 3, category_name: "Positioning", score: 7 },
    { report_id: r.id, slot: 4, category_name: "Decision making", score: 5 },
  ]);
  return api("/rest/v1/report_items", [
    { report_id: r.id, kind: "strength", body: `${prefix} strength: brave on the ball`, sort_order: 0, drill_title: null, drill_description: null },
    { report_id: r.id, kind: "workon", body: `${prefix} work-on: scan earlier`, sort_order: 0, drill_title: "Scan and receive", drill_description: "Check your shoulder twice before the ball arrives" },
    { report_id: r.id, kind: "workon", body: `${prefix} work-on: weak foot`, sort_order: 1, drill_title: "Wall passes", drill_description: "50 passes off the wall with your weaker foot" },
  ]);
}

const coach = await makeUser("focuscoach", "coach");
const parent = await makeUser("focusparent");
const childName = `Rio${stamp % 1000}`;
const [kid] = await api("/rest/v1/players", [{ first_name: childName, birth_year: new Date().getFullYear() - 11 }]);
await api("/rest/v1/guardianships", { guardian_id: parent.id, player_id: kid.id });
await api("/rest/v1/consents", { player_id: kid.id, guardian_id: parent.id, consent_version: "v1-draft" });
await api("/rest/v1/coach_assignments", { coach_id: coach.id, player_id: kid.id });
const published = await makeMatch(kid.id, "published", "United");
await makeReport(published.id, "published", "Published");
const inReview = await makeMatch(kid.id, "in_review", "Albion");
await makeReport(inReview.id, "draft", "Draft");

const browser = await chromium.launch();
try {
  const p = await logIn(browser, parent.email);
  check(await visible(p.getByText("No focus set this week.")), "parent home: no focus yet");

  await p.goto(`${APP}/matches/${published.id}`);
  check(await visible(p.getByRole("heading", { name: "Coach's report" })), "the published report is shown");
  check(await visible(p.getByText("8/10")) && await visible(p.getByText("Decision making")), "the four scores are shown");
  check(await visible(p.getByText("Published strength: brave on the ball")), "strengths are shown");
  check(await visible(p.getByText("Drill: Scan and receive")), "each work-on shows its drill");
  check(await visible(p.getByText("Check your shoulder twice before the ball arrives")), "with how to do it");

  await p.getByRole("button", { name: "Set as my focus this week" }).first().click();
  check(await visible(p.getByText("Your focus this week ✓")), "setting a focus marks it");
  await p.goto(`${APP}/dashboard`);
  check(await visible(p.getByText("Published work-on: scan earlier")), "the focus shows on the parent's home screen");
  check(await visible(p.getByText(childName, { exact: true })), "with the child's name");

  await p.goto(`${APP}/matches/${published.id}`);
  await p.getByRole("button", { name: "Set as my focus this week" }).first().click();
  // The tick was already showing for the first choice, so wait for the database instead.
  let focus = [];
  for (let i = 0; i < 20; i++) {
    focus = await api(`/rest/v1/player_focus?player_id=eq.${kid.id}&select=report_item_id,report_items(body)`, undefined, "GET");
    if (focus[0]?.report_items?.body === "Published work-on: weak foot") break;
    await p.waitForTimeout(500);
  }
  check(focus.length === 1 && focus[0].report_items.body === "Published work-on: weak foot", "choosing another work-on replaces the focus (one per week)");

  await p.goto(`${APP}/matches/${inReview.id}`);
  check(await gone(p.getByText("Draft strength: brave on the ball")), "a draft report is never shown to the parent");

  const c = await logIn(browser, coach.email);
  await c.goto(`${APP}/matches/${published.id}`);
  check(await visible(c.getByRole("heading", { name: "Coach's report" })), "the coach can see the published report");
  check(await gone(c.getByRole("button", { name: "Set as my focus this week" })), "but can't set the player's focus");
  check(await visible(c.getByText("Your focus this week ✓")), "and can see which work-on the player chose");
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
