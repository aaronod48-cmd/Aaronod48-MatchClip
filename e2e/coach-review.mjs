// End-to-end check of the coach review: default coach, review queue, making
// clips (times, ring, tags, notes), editing, deleting and publishing.
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
  const u = await api("/auth/v1/admin/users", {
    email: `${name.toLowerCase()}.${stamp}@test.local`, password: PASSWORD, email_confirm: true, user_metadata: { display_name: name },
  });
  if (role !== "parent") await api(`/rest/v1/profiles?id=eq.${u.id}`, { role }, "PATCH");
  return u;
}
async function logIn(browser, email) {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
  await page.goto(`${APP}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("form button[type=submit] >> nth=0");
  await page.waitForURL(/\/dashboard/);
  return page;
}

// The coach-to-be (admin), a parent with a child, and an unrelated coach.
// Start with no default coach so the test can set it.
await api("/rest/v1/app_settings?id=eq.true", { default_coach_id: null }, "PATCH");
const owner = await makeUser("Owner", "admin");
const otherCoach = await makeUser("Othercoach", "coach");
const parent = await makeUser("Parentr");
const childName = `Kai${stamp % 1000}`;
const [kid] = await api("/rest/v1/players", [{ first_name: childName, birth_year: new Date().getFullYear() - 11 }]);
await api("/rest/v1/guardianships", { guardian_id: parent.id, player_id: kid.id });
await api("/rest/v1/consents", { player_id: kid.id, guardian_id: parent.id, consent_version: "v1-draft" });
// A match already sent to the coach, with an uploaded first half and a tap.
const [match] = await api("/rest/v1/matches", [{
  player_id: kid.id, match_date: new Date().toISOString().slice(0, 10), opponent: "Rovers", team_shape: "4-4-2",
  kit_colour: "Blue shirt", shirt_number: 7, position: "RM", tap_half: "first", tap_seconds: 20, tap_x: 0.4, tap_y: 0.5,
  status: "waiting_for_coach", submitted_at: new Date().toISOString(),
}]);
await api("/rest/v1/match_videos", [
  { match_id: match.id, half: "first", provider: "fake", provider_asset_id: `fake-asset-${match.id}`, provider_playback_id: `fake-playback-${match.id}`, status: "ready", duration_seconds: 300 },
  { match_id: match.id, half: "second", provider: "fake", provider_asset_id: null, provider_playback_id: null, status: "waiting_upload", duration_seconds: null },
]);
const logBefore = (await api(`/rest/v1/staff_access_log?player_id=eq.${kid.id}&select=id`, undefined, "GET")).length;

const browser = await chromium.launch();
try {
  // ---- Default coach ----
  const c = await logIn(browser, owner.email);
  check(await visible(c.getByText("Nothing to review right now.")), "before being the default coach, nothing to review");
  await c.getByRole("button", { name: "Make me the default coach" }).click();
  await c.waitForURL(/defaultCoach=1/);
  check(await visible(c.getByText("You're the default coach ✓")), "admin is now the default coach");
  check(await visible(c.getByRole("link", { name: new RegExp(`${childName}.*Rovers`) })), "the match appears under 'Matches to review'");

  // ---- Open the review ----
  await c.getByRole("link", { name: new RegExp(`${childName}.*Rovers`) }).click();
  await c.waitForURL(/\/review\//);
  check(await visible(c.getByText("Coach is reviewing")), "opening it marks the match 'Coach is reviewing'");
  check(await visible(c.getByText(/#7 · Right midfield in 4-4-2 · kit: Blue shirt/)), "shows who to look for");
  check(await visible(c.getByRole("img", { name: "Where the player tapped themselves" })), "shows the player's tap frame");
  check(await visible(c.getByTestId("fake-player")), "the match video player is shown");

  // ---- Make a clip ----
  const time = c.getByLabel("Video time");
  await c.getByRole("button", { name: "Save clip" }).click();
  check(await visible(c.getByText("Mark the start and end of the clip.")), "can't save a clip without times");
  await time.fill("10");
  await c.getByRole("button", { name: /^Mark start/ }).click();
  await time.fill("90");
  await c.getByRole("button", { name: /^Mark end/ }).click();
  check(await visible(c.getByText("(must be 2 to 60 seconds)")), "an 80-second clip is flagged as too long");
  await time.fill("18");
  await c.getByRole("button", { name: /^Mark end/ }).click();
  check(await visible(c.getByText("Clip length 8.0 s")), "clip length shows 8 seconds");
  await time.fill("12");
  await c.getByRole("button", { name: "Place ring" }).click();
  const layer = c.getByRole("button", { name: "Tap the player to place the ring" });
  const box = await layer.boundingBox();
  await layer.click({ position: { x: box.width * 0.4, y: box.height * 0.5 } });
  check(await visible(c.getByRole("button", { name: "Move ring (at 0:12.0)" })), "ring placed at 0:12");
  await c.getByRole("button", { name: "Passing" }).click();
  await c.getByRole("button", { name: "First touch" }).click();
  await c.getByRole("button", { name: "Save clip" }).click();
  check(await visible(c.getByText("Please write a strength note.")), "a strength note is required");
  await c.getByLabel("Strength note").fill("Great first touch under pressure");
  await c.getByLabel("Work-on note (optional)").fill("Scan before receiving");
  await c.getByRole("button", { name: "Save clip" }).click();
  check(await visible(c.getByText("Clip saved.")), "clip saved");
  check(await visible(c.getByRole("button", { name: "0:10.0 – 0:18.0" })), "the clip is listed with its times");
  check(await visible(c.getByText("Draft")), "it's a draft until published");

  // ---- Edit it, add and delete another ----
  await c.getByRole("button", { name: "Edit" }).first().click();
  await c.getByLabel("Strength note").fill("Excellent first touch under pressure");
  await c.getByRole("button", { name: "Update clip" }).click();
  check(await visible(c.getByText("Clip updated.")), "editing a clip works");
  check(await visible(c.locator("li", { hasText: "Excellent first touch under pressure" })), "the clip list shows the new note");
  await time.fill("100");
  await c.getByRole("button", { name: /^Mark start/ }).click();
  await time.fill("105");
  await c.getByRole("button", { name: /^Mark end/ }).click();
  await c.getByLabel("Strength note").fill("Delete me");
  await c.getByRole("button", { name: "Save clip" }).click();
  await visible(c.getByText("Delete me"));
  c.once("dialog", (d) => d.accept());
  await c.locator("li", { hasText: "Delete me" }).getByRole("button", { name: "Delete" }).click();
  check(await gone(c.getByText("Delete me")), "deleting a clip works");

  // ---- Another coach can't get in ----
  const o = await logIn(browser, otherCoach.email);
  await o.goto(`${APP}/review/${match.id}`);
  check(await visible(o.getByText(/could not be found|404/i)), "a coach not assigned to the player gets 'not found'");

  // ---- Publish ----
  await c.getByRole("button", { name: "Publish clips" }).click();
  check(c.url().includes("/review/") && !c.url().includes("published"), "can't publish without ticking the box");
  await c.check("input[name=confirmPublish]");
  await c.getByRole("button", { name: "Publish clips" }).click();
  await c.waitForURL(/published=1/);
  check(await visible(c.getByText(`Published. ${childName} and their parent can now see the clips.`)), "published message");
  check(await visible(c.getByText("Published", { exact: true })), "the clip shows as Published");

  // ---- Edit after publishing ----
  await c.getByRole("button", { name: "Edit" }).first().click();
  check(await c.getByRole("button", { name: /^Mark start/ }).isDisabled(), "a published clip's times are locked");
  await c.getByLabel("Strength note").fill("Brilliant first touch under pressure");
  await c.getByRole("button", { name: "Update clip" }).click();
  check(await visible(c.getByText("Clip updated.")), "a published clip's note can still be changed");
  await time.fill("200");
  await c.getByRole("button", { name: /^Mark start/ }).click();
  await time.fill("210");
  await c.getByRole("button", { name: /^Mark end/ }).click();
  await c.getByLabel("Strength note").fill("Added after publishing");
  await c.getByRole("button", { name: "Save clip" }).click();
  check(await visible(c.getByRole("button", { name: "Publish new clips" })), "a clip added later waits for 'Publish new clips'");

  const clips = await api(`/rest/v1/clips?match_id=eq.${match.id}&status=eq.published&select=id,status,provider_asset_id,provider_playback_id,ring_seconds,ring_x`, undefined, "GET");
  check(clips.length === 1 && clips[0].status === "published", "one published clip in the database");
  check(clips[0].provider_asset_id === `fake-asset-clip-${clips[0].id}` && Boolean(clips[0].provider_playback_id),
    "the clip was cut as its own video at the video service");
  check(Number(clips[0].ring_seconds) === 2 && Math.abs(Number(clips[0].ring_x) - 0.4) < 0.02, "the ring is saved 2 s into the clip, where it was placed");
  const tags = await api(`/rest/v1/clip_tags?clip_id=eq.${clips[0].id}&select=source,confirmed_by`, undefined, "GET");
  check(tags.length === 2 && tags.every((t) => t.source === "coach" && t.confirmed_by === owner.id), "two coach-confirmed tags");
  const logAfter = (await api(`/rest/v1/staff_access_log?player_id=eq.${kid.id}&select=id,action,staff_id`, undefined, "GET"));
  check(logAfter.length > logBefore && logAfter.every((l) => l.staff_id === owner.id), "the coach's views of the minor's video were logged");
  const published1 = await api(`/rest/v1/clips?match_id=eq.${match.id}&status=eq.published&select=strength_note`, undefined, "GET");
  check(published1.length === 1 && published1[0].strength_note === "Brilliant first touch under pressure",
    "before publishing again: only the first clip is published, with its updated note");
  await c.check("input[name=confirmPublish]");
  await c.getByRole("button", { name: "Publish new clips" }).click();
  await c.getByRole("button", { name: "Publish new clips" }).waitFor({ state: "detached", timeout: 15000 });
  const published2 = await api(`/rest/v1/clips?match_id=eq.${match.id}&status=eq.published&select=id`, undefined, "GET");
  check(published2.length === 2, "'Publish new clips' publishes the clip added later");

  const parentApi = async () => {
    const page = await logIn(browser, parent.email);
    return page;
  };
  // ---- Parent sees it's ready ----
  const p = await parentApi();
  await p.goto(`${APP}/matches/${match.id}`);
  check(await visible(p.getByText("Clips ready")), "the parent's match page says 'Clips ready'");
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
  await api("/rest/v1/app_settings?id=eq.true", { default_coach_id: null }, "PATCH").catch(() => {});
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
