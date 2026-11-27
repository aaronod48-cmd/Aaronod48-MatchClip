// End-to-end check of "Share with my coach": private links that expire, open
// without an account, show only what was shared, and can be stopped.
// FAKE video service (app runs with VIDEO_PROVIDER=fake). LOCAL only.
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

const coach = await makeUser("sharecoach", "coach");
const parent = await makeUser("shareparent");
const childName = `Noa${stamp % 1000}`;
const [kid] = await api("/rest/v1/players", [{ first_name: childName, birth_year: new Date().getFullYear() - 11 }]);
await api("/rest/v1/guardianships", { guardian_id: parent.id, player_id: kid.id });
await api("/rest/v1/consents", { player_id: kid.id, guardian_id: parent.id, consent_version: "v1-draft" });
await api("/rest/v1/coach_assignments", { coach_id: coach.id, player_id: kid.id });
const [match] = await api("/rest/v1/matches", [{ player_id: kid.id, match_date: new Date().toISOString().slice(0, 10), opponent: "Wanderers", team_shape: "4-4-2", kit_colour: "Red", shirt_number: 7, position: "RM", status: "published", published_at: new Date().toISOString() }]);
const [rep] = await api("/rest/v1/reports", [{ match_id: match.id, status: "published", published_at: new Date().toISOString() }]);
await api("/rest/v1/report_scores", [1, 2, 3, 4].map((slot) => ({ report_id: rep.id, slot, category_name: ["Passing", "Duels", "Positioning", "Decision making"][slot - 1], score: 6 + (slot % 3) })));
await api("/rest/v1/report_items", [
  { report_id: rep.id, kind: "strength", body: "Shared strength: calm in possession", sort_order: 0, drill_title: null, drill_description: null },
  { report_id: rep.id, kind: "workon", body: "Shared work-on: first touch away from pressure", sort_order: 0, drill_title: "Rondo", drill_description: "4 v 1 in a small square" },
]);
await api("/rest/v1/clips", [{ match_id: match.id, start_seconds: 30, end_seconds: 40, strength_note: "Clip strength: great cross", workon_note: null, status: "published", provider_asset_id: "fake-asset-share", provider_playback_id: "fake-play-share" }]);

const browser = await chromium.launch();
try {
  const p = await logIn(browser, parent.email);
  await p.goto(`${APP}/matches/${match.id}`);

  // ---- Share the report ----
  await p.getByRole("button", { name: "Share report with my coach" }).click();
  await p.getByPlaceholder("e.g. Coach Sam at Rovers").fill("Coach Sam at Rovers");
  check(await p.getByLabel("7 days").isChecked(), "7 days is the default");
  await p.getByRole("button", { name: "Create private link" }).click();
  check(await visible(p.getByText("Your private link (works for 7 days)")), "a private link is created");
  const reportUrl = await p.getByLabel("Private link").inputValue();
  check(/\/s\/[A-Za-z0-9_-]{20,}$/.test(reportUrl), "the link holds a long random code");

  // ---- Share a clip for 1 day ----
  await p.getByRole("button", { name: "Share Clip 1 with my coach" }).click();
  await p.getByLabel("1 day", { exact: true }).check();
  await p.getByRole("button", { name: "Create private link" }).click();
  check(await visible(p.getByText("Your private link (works for 1 day)")), "a clip link is created for 1 day");
  const clipUrl = await p.getByLabel("Private link").last().inputValue();

  // ---- Someone without an account opens them ----
  const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await guest.goto(reportUrl);
  check(await visible(guest.getByText(`${childName} ·`, { exact: false })), "the shared page shows the player's first name");
  check(await visible(guest.getByText("Shared strength: calm in possession")), "the report opens without logging in");
  check(await visible(guest.getByText("Drill: Rondo")), "including the drills");
  check(await gone(guest.getByText("Clip strength: great cross")), "a shared report does NOT show the clips");
  check(await gone(guest.getByRole("button", { name: "Set as my focus this week" })), "and has no buttons to change anything");
  const referrer = await guest.locator('meta[name="referrer"]').getAttribute("content");
  check(referrer === "no-referrer", "the page tells browsers never to pass its address on");
  const robots = await guest.locator('meta[name="robots"]').getAttribute("content");
  check(Boolean(robots?.includes("noindex")), "and asks search engines not to list it");

  await guest.goto(clipUrl);
  check(await visible(guest.getByText("Clip strength: great cross")), "the shared clip opens");
  check(await gone(guest.getByText("Shared strength: calm in possession")), "a shared clip does NOT show the report");

  // ---- Shared links list ----
  await p.reload();
  check(await visible(p.getByRole("heading", { name: "Shared links" })), "the parent sees 'Shared links'");
  check(await visible(p.getByText("Report · Coach Sam at Rovers")), "with what was shared and who for");
  check(await visible(p.getByText(/Opened 1 time\b/)), "and how many times it's been opened");

  // ---- Stop sharing ----
  await p.locator("li", { hasText: "Report · Coach Sam at Rovers" }).getByRole("button", { name: "Stop sharing" }).click();
  check(await visible(p.locator("li", { hasText: "Report · Coach Sam at Rovers" }).getByText("Stopped")), "stopping a link shows 'Stopped'");
  await guest.goto(reportUrl);
  check(await visible(guest.getByText("This link no longer works")), "a stopped link no longer opens");

  // ---- Expiry ----
  await api(`/rest/v1/share_links?match_id=eq.${match.id}&kind=eq.clip`, { expires_at: new Date(Date.now() - 60000).toISOString() }, "PATCH");
  await guest.goto(clipUrl);
  check(await visible(guest.getByText("This link no longer works")), "an expired link no longer opens");
  await guest.goto(`${APP}/s/madeUpCodeThatIsLongEnough123456`);
  check(await visible(guest.getByText("This link no longer works")), "a made-up link opens nothing");

  // ---- Coaches don't share ----
  const c = await logIn(browser, coach.email);
  await c.goto(`${APP}/matches/${match.id}`);
  check(await visible(c.getByRole("heading", { name: "Coach's report" })), "the coach can see the report");
  check(await gone(c.getByRole("button", { name: /Share .* with my coach/ })), "but has no share buttons");
  check(await gone(c.getByRole("heading", { name: "Shared links" })), "and can't see the family's shared links");
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
