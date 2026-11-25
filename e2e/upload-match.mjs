// End-to-end check of adding a match and uploading halves, using the FAKE
// video service (the app must run with VIDEO_PROVIDER=fake). LOCAL only.
// Needs SUPABASE_LOCAL_SECRET_KEY; the app needs SUPABASE_SECRET_KEY too.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://localhost:3000";
const API = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_LOCAL_SECRET_KEY;
if (!API.includes("127.0.0.1") && !API.includes("localhost")) throw new Error("Local Supabase only!");
if (!KEY) throw new Error("Set SUPABASE_LOCAL_SECRET_KEY (see docs/testing.md)");

const stamp = Date.now();
const PASSWORD = "goodpass123";
const year = new Date().getFullYear();
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
async function makeUser(name, accountType = "parent") {
  return api("/auth/v1/admin/users", {
    email: `${name.toLowerCase()}.${stamp}@test.local`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name, account_type: accountType },
  });
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
// A pretend video file (the fake service throws the bytes away). ~2 MB.
const fakeVideo = { name: "test-half.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(2 * 1024 * 1024, 7) };

const parent = await makeUser("Morgan");
const stranger = await makeUser("Stranger");
const [kid, noConsent] = await api("/rest/v1/players", [
  { first_name: `Jay${stamp % 1000}`, birth_year: year - 10 },
  { first_name: `Lee${stamp % 1000}`, birth_year: year - 10 },
]);
await api("/rest/v1/guardianships", [
  { guardian_id: parent.id, player_id: kid.id },
  { guardian_id: parent.id, player_id: noConsent.id },
]);
await api("/rest/v1/consents", { player_id: kid.id, guardian_id: parent.id, consent_version: "v1-draft" });

const browser = await chromium.launch();
try {
  const p = await logIn(browser, parent.email);

  // ---- No consent: no matches ----
  await p.goto(`${APP}/children/${noConsent.id}`);
  check(await visible(p.getByRole("heading", { name: "Matches" })), "child page has a Matches section");
  check(await gone(p.getByRole("link", { name: "Add a match" })), "no 'Add a match' for a child without consent");

  // ---- Add a match ----
  await p.goto(`${APP}/children/${kid.id}`);
  await p.getByRole("link", { name: "Add a match" }).click();
  await p.waitForURL(/\/matches\/new\?player=/);
  check(await gone(p.getByText(noConsent.first_name)), "the new-match form only offers children with consent");
  await p.getByLabel("Opponent (optional)").fill("Rovers");
  await p.getByRole("button", { name: "4-3-3" }).click();
  await p.getByLabel("Shirt number").fill("7");
  await p.getByLabel("Kit colour").fill("Red shirt, white shorts");
  await p.getByRole("button", { name: "Next: upload the video" }).click();
  check(await visible(p.getByText("Please choose your position.")), "the database asks for a position if it's missing");
  await p.getByLabel("Position").selectOption("RW");
  await p.getByRole("button", { name: "Next: upload the video" }).click();
  await p.waitForURL(/\/matches\/[0-9a-f-]{36}$/);
  const matchUrl = p.url();
  const matchId = matchUrl.split("/").pop();
  check(await visible(p.getByText("v Rovers")), "match page shows the opponent");
  check(await visible(p.getByText("Right winger")), "match page shows the position in plain English");
  check(await visible(p.getByText("Not sent yet")), "match status is 'Not sent yet'");

  // ---- Upload the first half ----
  await p.locator("input[type=file]").first().setInputFiles(fakeVideo);
  check(await visible(p.getByText(/Uploaded ✓ · 2 min/), 20000), "first half uploads and shows 'Uploaded ✓ · 2 min'");
  check(await visible(p.getByText("Choose second half video")), "second half can still be uploaded");
  check(await visible(p.getByRole("link", { name: "Tap yourself" })), "points to the next step: tap yourself");

  const [video] = await api(`/rest/v1/match_videos?match_id=eq.${matchId}&half=eq.first&select=status,provider_asset_id,provider_playback_id`, undefined, "GET");
  check(video.status === "ready" && video.provider_asset_id && video.provider_playback_id, "the database records the video as ready, with its ids");

  // ---- The match shows on the child's page ----
  await p.goto(`${APP}/children/${kid.id}`);
  check(await visible(p.getByText("v Rovers")), "the match is listed on the child's page");

  // ---- Strangers can't see it ----
  const s = await logIn(browser, stranger.email);
  await s.goto(matchUrl);
  check(await visible(s.getByText(/could not be found|404/i)), "another parent gets 'not found' for the match");

  // ---- Adult player: profile first, then a match ----
  const adult = await makeUser("Robin", "player");
  const a = await logIn(browser, adult.email);
  await a.getByRole("link", { name: "Upload a match" }).click();
  await a.waitForURL(/\/matches\/new/);
  check(await visible(a.getByText("First, a little about you")), "an adult player sets up their profile first");
  await a.getByLabel("Year you were born").selectOption(String(year - 30));
  await a.getByRole("button", { name: "Continue" }).click();
  check(await visible(a.getByRole("button", { name: "Next: upload the video" })), "then sees the new-match form");

  // ---- Delete the match ----
  await p.goto(matchUrl);
  await p.getByRole("button", { name: "Delete this match…" }).click();
  await p.check("input[name=confirmDelete]");
  await p.getByRole("button", { name: "Delete permanently" }).click();
  await p.waitForURL(/\/dashboard\?matchDeleted=1/);
  check(await visible(p.getByText("The match and its videos have been deleted.")), "deleting the match is confirmed");
  const left = await api(`/rest/v1/matches?id=eq.${matchId}&select=id`, undefined, "GET");
  check(left.length === 0, "the match is really gone from the database");
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
