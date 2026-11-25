// End-to-end check of "tap yourself" and "send to coach", using the FAKE
// video service (app runs with VIDEO_PROVIDER=fake). LOCAL only.
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

const parent = await api("/auth/v1/admin/users", {
  email: `tapper.${stamp}@test.local`, password: PASSWORD, email_confirm: true, user_metadata: { display_name: "Tapper" },
});
const [kid] = await api("/rest/v1/players", [{ first_name: `Sky${stamp % 1000}`, birth_year: new Date().getFullYear() - 11 }]);
await api("/rest/v1/guardianships", { guardian_id: parent.id, player_id: kid.id });
await api("/rest/v1/consents", { player_id: kid.id, guardian_id: parent.id, consent_version: "v1-draft" });

const browser = await chromium.launch();
try {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto(`${APP}/login`);
  await p.fill("input[name=email]", parent.email);
  await p.fill("input[name=password]", PASSWORD);
  await p.click("form button[type=submit] >> nth=0");
  await p.waitForURL(/\/dashboard/);

  // A match with an uploaded first half.
  await p.goto(`${APP}/matches/new?player=${kid.id}`);
  await p.getByLabel("Position").selectOption("RCM");
  await p.getByLabel("Shirt number").fill("8");
  await p.getByLabel("Kit colour").fill("Yellow shirt, blue shorts");
  await p.getByRole("button", { name: "Next: upload the video" }).click();
  await p.waitForURL(/\/matches\/[0-9a-f-]{36}$/);
  const matchUrl = p.url();
  const matchId = matchUrl.split("/").pop();
  check(await gone(p.getByRole("link", { name: "Tap yourself" })), "no 'Tap yourself' before a half is uploaded");
  await p.locator("input[type=file]").first().setInputFiles({ name: "h1.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(1024 * 1024, 1) });
  check(await visible(p.getByRole("link", { name: "Tap yourself" }), 20000), "'Tap yourself' appears once a half is uploaded");
  check(await gone(p.getByRole("button", { name: "Send to coach" })), "can't send to the coach before tapping");
  check(await visible(p.getByRole("img", { name: /4-4-2, playing RCM, number 8/ })), "the pitch diagram shows the shape, position and shirt number");

  // Tap yourself
  await p.getByRole("link", { name: "Tap yourself" }).click();
  await p.waitForURL(/\/tap$/);
  check(await visible(p.getByRole("img", { name: /Frame at/ })), "a still frame from the video is shown");
  const save = p.getByRole("button", { name: "That's me. Save" });
  check(await save.isDisabled(), "Save is disabled until you tap yourself");
  await p.getByLabel("Moment in the video").fill("40");
  check(await visible(p.getByText("0:40 / 2:05")), "the slider picks a moment in the half");
  check(await visible(p.getByRole("img", { name: "Frame at 0:40" })), "the frame changes to that moment");
  const pic = p.getByRole("button", { name: "Tap on yourself in the picture" });
  const box = await pic.boundingBox();
  await pic.click({ position: { x: box.width * 0.25, y: box.height * 0.6 } });
  check(await save.isEnabled(), "after tapping, Save is enabled");
  await save.click();
  await p.waitForURL(/tapped=1/);
  check(await visible(p.getByText("Tap saved. Now send the match to your coach.")), "tap saved message");
  check(await visible(p.getByRole("img", { name: "The frame where you tapped yourself" })), "the saved tap is shown on its frame");

  const [m1] = await api(`/rest/v1/matches?id=eq.${matchId}&select=tap_half,tap_seconds,tap_x,tap_y,status`, undefined, "GET");
  check(m1.tap_half === "first" && Number(m1.tap_seconds) === 40 && Math.abs(Number(m1.tap_x) - 0.25) < 0.02 && Math.abs(Number(m1.tap_y) - 0.6) < 0.02,
    "the database saved the half, moment and where you tapped");

  // Send to coach
  await p.getByRole("button", { name: "Send to coach" }).click();
  await p.waitForURL(/sent=1/);
  check(await visible(p.getByText("Sent to the coach.")), "sent to coach message");
  check(await visible(p.getByText("Waiting for coach")), "status is now 'Waiting for coach'");
  check(await gone(p.getByRole("link", { name: "Change" })), "the tap can no longer be changed");
  check(await gone(p.getByText("Choose second half video")), "no more uploads once sent");
  await p.goto(`${matchUrl}/tap`);
  check(await p.waitForURL(matchUrl, { timeout: 8000 }).then(() => true, () => false), "the tap page sends you back to the match once it's with the coach");
  const [m2] = await api(`/rest/v1/matches?id=eq.${matchId}&select=status`, undefined, "GET");
  check(m2.status === "waiting_for_coach", "the database shows the match waiting for the coach");
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
