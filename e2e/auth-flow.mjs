// End-to-end check of sign-up, verify email, log in/out and password reset.
// Runs a real browser against the app + a LOCAL Supabase (never the real one).
// Usage: see docs/testing.md
// Uses the Playwright already installed on the machine (not a project dependency).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MAIL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const stamp = Date.now();
let failures = 0;

function check(ok, what) {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures++;
}

/** Waits up to 8 seconds for something to appear on screen. */
const visible = (locator) =>
  locator.first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);

async function latestLinkFor(email, { after = 0 } = {}) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages = [] } = await res.json();
    const fresh = messages.filter((m) => Date.parse(m.Created) > after);
    if (fresh.length) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${fresh[0].ID}`)).json();
      const link = (msg.Text + " " + msg.HTML).match(/https?:\/\/[^\s"'<>]+\/verify\?[^\s"'<>]+/);
      if (link) return link[0].replaceAll("&amp;", "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email arrived for ${email}`);
}

async function signUp(page, { email, name = "Jo", type = "parent", password = "goodpass123", adult = true }) {
  await page.goto(`${APP}/signup`);
  await page.locator(`input[name=accountType][value=${type === "coach" ? "parent" : type}]`).check();
  if (type === "coach") {
    // Tamper with the form like a sneaky user would.
    await page.locator("input[name=accountType][value=parent]").evaluate((el) => (el.value = "coach"));
  }
  await page.fill("input[name=firstName]", name);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  if (adult) await page.check("input[name=isAdult]");
  else await page.locator("input[name=isAdult]").evaluate((el) => el.removeAttribute("required"));
  await page.click("button[type=submit]");
}

async function logIn(page, email, password) {
  await page.goto(`${APP}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("form button[type=submit] >> nth=0");
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = `parent.${stamp}@test.local`;

  // 1. Sign up and verify
  const t0 = Date.now() - 1000;
  await signUp(page, { email });
  await page.waitForURL(/\/check-email/);
  check(await visible(page.getByText("We've sent you a link")), "sign-up shows 'check your email'");

  await page.goto(await latestLinkFor(email, { after: t0 }));
  await page.waitForURL(/\/dashboard/);
  check(await visible(page.getByRole("heading", { name: "Hi Jo" })), "verification link logs you in and greets you by name");
  check(await visible(page.getByText("Parent or guardian")), "account type shows as Parent or guardian");

  // 2. Log out, private page is blocked
  await page.click("text=Log out");
  await page.waitForURL(/\/login\?signedOut=1/);
  check(await visible(page.getByText("You've logged out.")), "log out works");
  await page.goto(`${APP}/dashboard`);
  check(page.url().endsWith("/login"), "logged-out visitors are sent from the dashboard to log in");

  // 3. Wrong password, then right password
  await logIn(page, email, "wrongpass999");
  check(await visible(page.getByText("don't match")), "wrong password gives a clear message");
  await logIn(page, email, "goodpass123");
  await page.waitForURL(/\/dashboard/);
  check(true, "log in with the right password works");
  await page.click("text=Log out");
  await page.waitForURL(/\/login/);

  // 4. Forgot password
  const t1 = Date.now() - 1000;
  await page.goto(`${APP}/forgot-password`);
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/check-email\?for=reset/);
  await page.goto(await latestLinkFor(email, { after: t1 }));
  await page.waitForURL(/\/reset-password/);
  await page.fill("input[name=password]", "newpass4567");
  await page.fill("input[name=confirm]", "newpass4567");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/dashboard\?updated=password/);
  check(await visible(page.getByText("Your new password is saved.")), "password reset works");
  await page.click("text=Log out");
  await page.waitForURL(/\/login/);
  await logIn(page, email, "goodpass123");
  check(await visible(page.getByText("don't match")), "old password no longer works");
  await logIn(page, email, "newpass4567");
  await page.waitForURL(/\/dashboard/);
  check(true, "new password works");

  // 5. Sneaky sign-ups are refused
  const p2 = await (await browser.newContext()).newPage();
  await signUp(p2, { email: `coach.${stamp}@test.local`, type: "coach" });
  check(await visible(p2.getByText("choose whether you're a parent or a player")), "tampered 'coach' sign-up is refused");
  await signUp(p2, { email: `kid.${stamp}@test.local`, adult: false });
  check(await visible(p2.getByText("18 or over to create an account")), "sign-up without the 18+ box is refused");

  // 6. Adult player sign-up
  const playerEmail = `player.${stamp}@test.local`;
  const t2 = Date.now() - 1000;
  await signUp(p2, { email: playerEmail, name: "Pat", type: "player" });
  await p2.waitForURL(/\/check-email/);

  // 7. Not verified yet: clear message + resend button
  await logIn(p2, playerEmail, "goodpass123");
  check(await visible(p2.getByText("verify your email first")), "unverified login explains what to do");
  check(await visible(p2.getByText("Send a new verification link")), "offers to resend the link");

  // 8. Verify link opened in a DIFFERENT browser (e.g. phone email app)
  const other = await (await browser.newContext()).newPage();
  await other.goto(await latestLinkFor(playerEmail, { after: t2 }));
  await other.waitForURL(/\/login/);
  check(await visible(other.getByText("your email is verified")), "link opened on another device says 'verified, please log in'");
  await logIn(other, playerEmail, "goodpass123");
  await other.waitForURL(/\/dashboard/);
  check(await visible(other.getByText("Player", { exact: true })), "adult player can then log in and shows as Player");
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
