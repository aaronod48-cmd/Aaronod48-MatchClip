// End-to-end check of "Search clips by tag": each person only finds clips
// they're allowed to see, and only coach-confirmed tags count. LOCAL only.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://localhost:3000";
const API = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_LOCAL_SECRET_KEY;
if (!API.includes("127.0.0.1") && !API.includes("localhost")) throw new Error("Local Supabase only!");
if (!KEY) throw new Error("Set SUPABASE_LOCAL_SECRET_KEY (see docs/testing.md)");

const stamp = Date.now();
const S = stamp % 100000;
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

const coach = await makeUser("searchcoach", "coach");
const parentA = await makeUser("searchparenta");
const parentB = await makeUser("searchparentb");
const [amy, ben] = await api("/rest/v1/players", [
  { first_name: `Amy${S}`, birth_year: new Date().getFullYear() - 10 },
  { first_name: `Ben${S}`, birth_year: new Date().getFullYear() - 10 },
]);
await api("/rest/v1/guardianships", [{ guardian_id: parentA.id, player_id: amy.id }, { guardian_id: parentB.id, player_id: ben.id }]);
await api("/rest/v1/consents", [
  { player_id: amy.id, guardian_id: parentA.id, consent_version: "v1-draft" },
  { player_id: ben.id, guardian_id: parentB.id, consent_version: "v1-draft" },
]);
await api("/rest/v1/coach_assignments", [{ coach_id: coach.id, player_id: amy.id }, { coach_id: coach.id, player_id: ben.id }]);
const today = new Date().toISOString().slice(0, 10);
const [ma, mb] = await api("/rest/v1/matches", [
  { player_id: amy.id, match_date: today, opponent: "Rovers", team_shape: "4-4-2", kit_colour: "Red", shirt_number: 7, position: "RM", status: "published" },
  { player_id: ben.id, match_date: today, opponent: "City", team_shape: "4-4-2", kit_colour: "Blue", shirt_number: 4, position: "RCB", status: "published" },
]);
const clips = await api("/rest/v1/clips", [
  { match_id: ma.id, start_seconds: 65, end_seconds: 75, strength_note: `Amy${S} published defending`, status: "published" },
  { match_id: ma.id, start_seconds: 125, end_seconds: 135, strength_note: `Amy${S} draft defending`, status: "draft" },
  { match_id: ma.id, start_seconds: 185, end_seconds: 195, strength_note: `Amy${S} AI-only`, status: "published" },
  { match_id: mb.id, start_seconds: 245, end_seconds: 255, strength_note: `Ben${S} published defending`, status: "published" },
]);
const [tag] = await api(`/rest/v1/tags?name=eq.${encodeURIComponent("1v1 Defence")}&select=id`, undefined, "GET");
const now = new Date().toISOString();
await api("/rest/v1/clip_tags", clips.map((c) => {
  const ai = c.strength_note.endsWith("AI-only");
  return { clip_id: c.id, tag_id: tag.id, source: ai ? "ai" : "coach", confirmed_by: ai ? null : coach.id, confirmed_at: ai ? null : now };
}));

const browser = await chromium.launch();
try {
  // ---- Coach ----
  const c = await logIn(browser, coach.email);
  await c.getByRole("link", { name: /Search clips by tag/ }).click();
  await c.waitForURL(/\/clips/);
  check(await visible(c.getByText("Choose a tag to see every clip with it.")), "the search page asks for a tag");
  await c.getByRole("listitem").filter({ hasText: "1v1 Defence" }).click();
  await c.waitForURL(/tag=/);
  check(await visible(c.getByText(`Amy${S} published defending`)), "coach finds Amy's published clip");
  check(await visible(c.getByText(`Ben${S} published defending`)), "and Ben's (both their players)");
  check(await visible(c.getByText(`Amy${S} draft defending`)), "and their draft clip");
  check(await visible(c.locator("li", { hasText: `Amy${S} draft defending` }).getByText("Draft")), "marked as Draft");
  check(await gone(c.getByText(`Amy${S} AI-only`)), "but not a clip with only an unconfirmed AI tag");
  check(await visible(c.getByText("First half").or(c.getByText("1:05"))), "results show where in the match");
  const href = await c.locator("a", { hasText: `Amy${S} published defending` }).getAttribute("href");
  check(href === `/review/${ma.id}`, "the coach's result opens the review screen");

  // ---- Parent A ----
  const a = await logIn(browser, parentA.email);
  await a.goto(`${APP}/clips?tag=${tag.id}`);
  check(await visible(a.getByText(`Amy${S} published defending`)), "parent finds their child's published clip");
  check(await gone(a.getByText(`Amy${S} draft defending`)), "but not a draft");
  check(await gone(a.getByText(`Ben${S} published defending`)), "and never another family's clip");
  check(await gone(a.getByText(`Amy${S} AI-only`)), "and never an unconfirmed AI tag");
  const ahref = await a.locator("a", { hasText: `Amy${S} published defending` }).getAttribute("href");
  check(ahref === `/matches/${ma.id}`, "the parent's result opens the match page");

  // ---- Parent B ----
  const b = await logIn(browser, parentB.email);
  await b.goto(`${APP}/clips?tag=${tag.id}`);
  check(await visible(b.getByText(`Ben${S} published defending`)), "the other parent finds only Ben's clip");
  check(await gone(b.getByText(`Amy${S} published defending`)), "and not Amy's");
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
