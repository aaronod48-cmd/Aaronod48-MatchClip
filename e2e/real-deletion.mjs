// End-to-end check that deleting really deletes: "Delete my account" for a
// parent (children, teen login, matches, video files) and the daily clean-up
// job (60-day rule, password-protected). FAKE video service. LOCAL only.
// The app must run with CRON_SECRET=test-cron-secret.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://localhost:3000";
const API = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_LOCAL_SECRET_KEY;
const CRON = process.env.CRON_SECRET ?? "test-cron-secret";
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
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
async function api(path, body, method = "POST") {
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw Object.assign(new Error(`${path}: ${res.status} ${await res.text()}`), { status: res.status });
  return res.status === 204 ? null : res.json();
}
const userExists = async (id) => api(`/auth/v1/admin/users/${id}`, undefined, "GET").then(() => true, (e) => (e.status === 404 ? false : Promise.reject(e)));
async function makeUser(name, meta = {}) {
  return api("/auth/v1/admin/users", { email: `${name}.${stamp}@test.local`, password: PASSWORD, email_confirm: true, user_metadata: { display_name: name, ...meta } });
}
async function logIn(browser, email, password = PASSWORD) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${APP}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("form button[type=submit] >> nth=0");
  return page;
}
const pending = async () => api("/rest/v1/rpc/next_provider_deletions", { p_limit: 500 });

// A parent with a child (match, video, clip) and a teen with their own login.
const parent = await makeUser("delparent");
const teenLogin = await makeUser("delteen", { account_type: "player" });
const [child, teen] = await api("/rest/v1/players", [
  { first_name: `Del${stamp % 1000}`, birth_year: year - 10, user_id: null },
  { first_name: `Teen${stamp % 1000}`, birth_year: year - 15, user_id: teenLogin.id },
]);
await api("/rest/v1/guardianships", [{ guardian_id: parent.id, player_id: child.id }, { guardian_id: parent.id, player_id: teen.id }]);
await api("/rest/v1/consents", [
  { player_id: child.id, guardian_id: parent.id, consent_version: "v1-draft" },
  { player_id: teen.id, guardian_id: parent.id, consent_version: "v1-draft" },
]);
const [m] = await api("/rest/v1/matches", [{ player_id: child.id, match_date: new Date().toISOString().slice(0, 10), team_shape: "4-4-2", kit_colour: "Red", shirt_number: 5, position: "LB", status: "published", published_at: new Date().toISOString() }]);
const [v] = await api("/rest/v1/match_videos", [{ match_id: m.id, half: "first", provider: "fake", provider_asset_id: `del-video-${stamp}`, status: "ready" }]);
await api("/rest/v1/clips", [{ match_id: m.id, video_id: v.id, start_seconds: 1, end_seconds: 5, strength_note: "x", status: "published", provider_asset_id: `del-clip-${stamp}` }]);

const browser = await chromium.launch();
try {
  // ---- A teen can't delete their own account ----
  const t = await logIn(browser, teenLogin.email);
  await t.waitForURL(/\/dashboard/);
  await t.getByRole("link", { name: "Delete my account" }).click();
  check(await visible(t.getByText("Please ask your parent or guardian.")), "a teen is told to ask their parent");

  // ---- Parent deletes their account ----
  const p = await logIn(browser, parent.email);
  await p.waitForURL(/\/dashboard/);
  await p.getByRole("link", { name: "Delete my account" }).click();
  await p.waitForURL(/\/account\/delete/);
  check(await visible(p.getByText("Their teen logins, consent records, matches, videos, clips and coach notes")), "the page says exactly what will be deleted");
  await p.getByLabel('Type "delete" to confirm').fill("nope");
  await p.check("input[name=confirmDelete]");
  await p.getByRole("button", { name: "Delete my account permanently" }).click();
  check(await visible(p.getByText('Please type "delete" to confirm.')), "it must be confirmed by typing 'delete'");
  await p.getByLabel('Type "delete" to confirm').fill("delete");
  await p.check("input[name=confirmDelete]");
  await p.getByRole("button", { name: "Delete my account permanently" }).click();
  await p.waitForURL(/\/login\?accountDeleted=1/);
  check(await visible(p.getByText("Your account and everything in it has been deleted.")), "confirmation shown after deleting");

  check(!(await userExists(parent.id)), "the parent's login is deleted");
  check(!(await userExists(teenLogin.id)), "their teen's login is deleted too");
  const leftPlayers = await api(`/rest/v1/players?id=in.(${child.id},${teen.id})&select=id`, undefined, "GET");
  check(leftPlayers.length === 0, "both children's profiles are deleted");
  const leftMatches = await api(`/rest/v1/matches?id=eq.${m.id}&select=id`, undefined, "GET");
  check(leftMatches.length === 0, "the match, its video and clips are deleted");
  const waiting = (await pending()).filter((d) => [`del-video-${stamp}`, `del-clip-${stamp}`].includes(d.asset_id));
  check(waiting.length === 0, "the video and clip files were deleted at the video service straight away");

  const again = await logIn(browser, parent.email);
  check(await visible(again.getByText("don't match")), "the deleted account can't log in");

  // ---- Daily clean-up job ----
  const noAuth = await fetch(`${APP}/api/cron/daily`);
  check(noAuth.status === 401, "the daily job refuses to run without its password");
  const wrong = await fetch(`${APP}/api/cron/daily`, { headers: { Authorization: "Bearer wrong" } });
  check(wrong.status === 401, "and with the wrong password");

  const adult = await makeUser("deladult", { account_type: "player" });
  const [ap] = await api("/rest/v1/players", [{ first_name: "Adult", birth_year: year - 30, user_id: adult.id }]);
  const [old] = await api("/rest/v1/matches", [{ player_id: ap.id, match_date: new Date().toISOString().slice(0, 10), team_shape: "4-4-2", kit_colour: "Blue", shirt_number: 9, position: "RST", status: "published", published_at: new Date().toISOString() }]);
  const [ov] = await api("/rest/v1/match_videos", [{ match_id: old.id, half: "first", provider: "fake", provider_asset_id: `old-video-${stamp}`, status: "ready", delete_after: new Date(Date.now() - 86400000).toISOString() }]);
  await api("/rest/v1/clips", [{ match_id: old.id, video_id: ov.id, start_seconds: 1, end_seconds: 5, strength_note: "kept", status: "published", provider_asset_id: `old-clip-${stamp}`, provider_playback_id: `old-clip-play-${stamp}` }]);

  const run = await fetch(`${APP}/api/cron/daily`, { headers: { Authorization: `Bearer ${CRON}` } });
  const report = await run.json();
  check(run.status === 200 && report.expiredVideos >= 1, "with the right password, the job removes full videos older than 60 days");
  const oldVideos = await api(`/rest/v1/match_videos?match_id=eq.${old.id}&select=id`, undefined, "GET");
  const keptClips = await api(`/rest/v1/clips?match_id=eq.${old.id}&select=id`, undefined, "GET");
  check(oldVideos.length === 0 && keptClips.length === 1, "the full video is gone and the clip is kept");
  check(!(await pending()).some((d) => d.asset_id === `old-video-${stamp}`), "the old video's file was deleted at the video service");

  const a = await logIn(browser, adult.email);
  await a.waitForURL(/\/dashboard/);
  await a.goto(`${APP}/matches/${old.id}`);
  check(await visible(a.getByText(/Full video removed/)), "the match page explains the full video was removed after 60 days");
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
