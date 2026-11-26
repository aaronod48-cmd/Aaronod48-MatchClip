// End-to-end check of what a parent / player sees on a published match:
// only published clips, only coach-confirmed tags, notes in the right colours,
// and the coach's ring at its moment. FAKE video service. LOCAL only.
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

const coach = await makeUser("clipcoach", "coach");
const parent = await makeUser("clipparent");
const stranger = await makeUser("clipstranger");
const childName = `Ari${stamp % 1000}`;
const [kid] = await api("/rest/v1/players", [{ first_name: childName, birth_year: new Date().getFullYear() - 12 }]);
await api("/rest/v1/guardianships", { guardian_id: parent.id, player_id: kid.id });
await api("/rest/v1/consents", { player_id: kid.id, guardian_id: parent.id, consent_version: "v1-draft" });
await api("/rest/v1/coach_assignments", { coach_id: coach.id, player_id: kid.id });
const [match] = await api("/rest/v1/matches", [{
  player_id: kid.id, match_date: new Date().toISOString().slice(0, 10), opponent: "City", team_shape: "4-3-3",
  kit_colour: "Green", shirt_number: 9, position: "ST", tap_half: "first", tap_seconds: 5, tap_x: 0.5, tap_y: 0.5,
  status: "published", submitted_at: new Date().toISOString(), published_at: new Date().toISOString(),
}]);
const [first] = await api("/rest/v1/match_videos", [
  { match_id: match.id, half: "first", provider: "fake", provider_asset_id: `fake-asset-${match.id}`, provider_playback_id: `fake-playback-${match.id}`, status: "ready", duration_seconds: 600 },
]);
const [c1, c2, c3, draft] = await api("/rest/v1/clips", [
  { match_id: match.id, video_id: first.id, start_seconds: 30, end_seconds: 40, ring_seconds: 4, ring_x: 0.3, ring_y: 0.6, strength_note: "Lovely first touch", workon_note: "Check your shoulder earlier", status: "published", provider_asset_id: "fake-asset-clip-a", provider_playback_id: "fake-playback-clip-a", created_by: coach.id },
  { match_id: match.id, video_id: first.id, start_seconds: 90, end_seconds: 98, ring_seconds: null, ring_x: null, ring_y: null, strength_note: "Won the duel", workon_note: null, status: "published", provider_asset_id: null, provider_playback_id: null, created_by: coach.id },
  { match_id: match.id, video_id: null, start_seconds: 200, end_seconds: 210, ring_seconds: null, ring_x: null, ring_y: null, strength_note: "Good press", workon_note: null, status: "published", provider_asset_id: null, provider_playback_id: null, created_by: coach.id },
  { match_id: match.id, video_id: first.id, start_seconds: 300, end_seconds: 310, ring_seconds: null, ring_x: null, ring_y: null, strength_note: "SECRET DRAFT", workon_note: null, status: "draft", provider_asset_id: null, provider_playback_id: null, created_by: coach.id },
]);
const tagId = async (name) => (await api(`/rest/v1/tags?name=eq.${encodeURIComponent(name)}&select=id`, undefined, "GET"))[0].id;
const now = new Date().toISOString();
await api("/rest/v1/clip_tags", [
  { clip_id: c1.id, tag_id: await tagId("First touch"), source: "coach", confirmed_by: coach.id, confirmed_at: now },
  { clip_id: c1.id, tag_id: await tagId("Shooting"), source: "ai", confirmed_by: null, confirmed_at: null },
  { clip_id: c2.id, tag_id: await tagId("Duels"), source: "coach", confirmed_by: coach.id, confirmed_at: now },
]);

const browser = await chromium.launch();
try {
  const p = await logIn(browser, parent.email);
  await p.goto(`${APP}/matches/${match.id}`);
  check(await visible(p.getByRole("heading", { name: `${childName}'s clips (3)` })), "parent sees the 3 published clips");
  check(await gone(p.getByText("SECRET DRAFT")), "a draft clip is never shown");
  check(await visible(p.getByText("Lovely first touch")), "strength note shown");
  check(await visible(p.getByText("Check your shoulder earlier")), "work-on note shown");
  const strengthColour = await p.getByText("Strength", { exact: true }).first().evaluate((el) => getComputedStyle(el).color);
  const workonColour = await p.getByText("Work-on", { exact: true }).first().evaluate((el) => getComputedStyle(el).color);
  check(strengthColour === "rgb(200, 240, 74)", "strength label is lime");
  check(workonColour === "rgb(245, 169, 74)", "work-on label is orange");
  check(await visible(p.getByRole("list", { name: "Tags" }).getByText("First touch")), "coach-confirmed tag shown");
  check(await gone(p.getByRole("list", { name: "Tags" }).getByText("Shooting")), "AI-suggested (unconfirmed) tag NOT shown");
  check(await visible(p.getByText("This clip is being prepared.")), "a clip still being cut says 'being prepared'");
  check((await p.getByTestId("fake-clip-player").count()) === 2, "the two ready clips have players (one was cut just now)");

  // The coach's ring appears only around its moment (4 s into clip 1).
  check(await gone(p.getByRole("img", { name: "Coach's ring" })), "no ring at the start of the clip");
  await p.getByLabel("Clip 1 time").fill("4");
  check(await visible(p.getByRole("img", { name: "Coach's ring" })), "the ring appears at the moment the coach placed it");
  await p.getByLabel("Clip 1 time").fill("9");
  check(await gone(p.getByRole("img", { name: "Coach's ring" })), "and disappears afterwards");

  const [cut] = await api(`/rest/v1/clips?id=eq.${c2.id}&select=provider_asset_id,provider_playback_id`, undefined, "GET");
  check(cut.provider_asset_id === `fake-asset-clip-${c2.id}` && Boolean(cut.provider_playback_id), "the uncut clip was cut when the page loaded");

  const s = await logIn(browser, stranger.email);
  await s.goto(`${APP}/matches/${match.id}`);
  check(await visible(s.getByText(/could not be found|404/i)), "another parent gets 'not found'");

  const logs = await api(`/rest/v1/staff_access_log?player_id=eq.${kid.id}&select=id`, undefined, "GET");
  check(logs.length === 0, "a parent watching clips is not logged as staff access");
  void draft;
  void c3;
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
