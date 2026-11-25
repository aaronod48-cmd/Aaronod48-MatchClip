// End-to-end check of teen (13-17) logins: invite, accept, what the teen sees,
// consent withdrawal, removing the login, and deleting a child with a login.
// LOCAL Supabase only. Needs SUPABASE_LOCAL_SECRET_KEY; the app must run with
// SUPABASE_SECRET_KEY set to the same local key.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP_URL ?? "http://localhost:3000";
const API = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const MAIL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
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
const visible = (loc) => loc.first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
const gone = (loc) => loc.first().waitFor({ state: "hidden", timeout: 4000 }).then(() => true, () => false);

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function api(path, body, method = "POST") {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...headers, Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw Object.assign(new Error(`${path}: ${res.status}`), { status: res.status });
  return res.status === 204 ? null : res.json();
}
async function makeParent(name) {
  return api("/auth/v1/admin/users", {
    email: `${name.toLowerCase()}.${stamp}@test.local`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
}
async function inviteLinkFor(email) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages = [] } = await res.json();
    if (messages.length) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${messages[0].ID}`)).json();
      const link = (msg.Text + " " + msg.HTML).match(/https?:\/\/[^\s"'<>]+\/verify\?[^\s"'<>]+/);
      if (link) return link[0].replaceAll("&amp;", "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No invite email for ${email}`);
}
async function logIn(page, email, password = PASSWORD) {
  await page.goto(`${APP}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("form button[type=submit] >> nth=0");
}

const parent = await makeParent("Taylor");
const [teen, young] = await api("/rest/v1/players", [
  { first_name: `Ash${stamp % 1000}`, birth_year: year - 15, team_name: "Under 16 Falcons" },
  { first_name: `Bo${stamp % 1000}`, birth_year: year - 9, team_name: null },
]);
await api("/rest/v1/guardianships", [
  { guardian_id: parent.id, player_id: teen.id },
  { guardian_id: parent.id, player_id: young.id },
]);
await api("/rest/v1/consents", [
  { player_id: teen.id, guardian_id: parent.id, consent_version: "v1-draft" },
  { player_id: young.id, guardian_id: parent.id, consent_version: "v1-draft" },
]);
const teenEmail = `ash.${stamp}@test.local`;

const browser = await chromium.launch();
try {
  const p = await (await browser.newContext()).newPage();
  await logIn(p, parent.email);
  await p.waitForURL(/\/dashboard/);

  // ---- Under-13: no invite offered ----
  await p.goto(`${APP}/children/${young.id}`);
  check(await visible(p.getByText("don't get their own login")), "under-13: explains they don't get their own login");
  check(await gone(p.getByRole("button", { name: /Invite .* to their own login/ })), "under-13: no invite button");

  // ---- Teen: invite ----
  await p.goto(`${APP}/children/${teen.id}`);
  const inviteBtn = p.getByRole("button", { name: `Invite ${teen.first_name} to their own login` });
  check(await visible(inviteBtn), "teen: invite button is offered");
  await p.getByLabel(`${teen.first_name}'s own email`).fill(parent.email);
  await inviteBtn.click();
  check(await visible(p.getByText("use your child's own email")), "can't invite using the parent's own email");
  const other = await makeParent("Existing");
  await p.getByLabel(`${teen.first_name}'s own email`).fill(other.email);
  await inviteBtn.click();
  check(await visible(p.getByText("already has an account")), "can't invite an email that already has an account");
  await p.getByLabel(`${teen.first_name}'s own email`).fill(teenEmail);
  await inviteBtn.click();
  await p.waitForURL(/invited=1/);
  check(await visible(p.getByText("Invite sent.")), "invite sent message");
  check(await visible(p.getByText(`${teen.first_name} has their own login ✓`)), "page shows the teen has a login");

  // ---- Teen accepts ----
  const t = await (await browser.newContext()).newPage();
  await t.goto(await inviteLinkFor(teenEmail));
  await t.waitForURL(/\/auth\/accept-invite/);
  check(await visible(t.getByText("Choose a password for your own login")), "invite link opens the set-password page");
  check(!t.url().includes("access_token"), "the one-time login is removed from the address bar");
  await t.fill("input[name=password]", "teenpass123");
  await t.fill("input[name=confirm]", "teenpass123");
  await t.getByRole("button", { name: "Save password" }).click();
  await t.waitForURL(/\/dashboard/);
  check(await visible(t.getByRole("heading", { name: `Hi ${teen.first_name}` })), "teen lands on their home, greeted by name");
  check(await visible(t.getByText("Player", { exact: true })), "teen's account is a Player");
  check(await visible(t.getByText("Your parent or guardian manages your details.")), "teen sees their own record");
  check(await gone(t.getByText(young.first_name)), "teen does NOT see their younger sibling");

  // ---- Consent withdrawn: teen sees nothing ----
  await p.getByRole("button", { name: "Withdraw consent" }).click();
  await p.waitForURL(/withdrawn=1/);
  await t.reload();
  check(await gone(t.getByText("Your parent or guardian manages your details.")), "after consent is withdrawn, the teen's record disappears for them");
  await p.getByRole("button", { name: "Read and give consent" }).click();
  await p.check("input[name=consentConfirmed]");
  await p.getByRole("button", { name: "I agree" }).click();
  await p.waitForURL(/consented=1/);
  await t.reload();
  check(await visible(t.getByText("Your parent or guardian manages your details.")), "consent given again: the teen sees their record again");

  // ---- Remove the teen's login ----
  await p.getByRole("button", { name: "Remove their login" }).click();
  await p.waitForURL(/loginRemoved=1/);
  check(await visible(p.getByText("own login has been removed")), "parent can remove the teen's login");
  const t2 = await (await browser.newContext()).newPage();
  await logIn(t2, teenEmail, "teenpass123");
  check(await visible(t2.getByText("don't match")), "the removed login can no longer log in");
  check(await visible(p.getByRole("button", { name: `Invite ${teen.first_name} to their own login` })), "the teen's profile stays, and can be invited again");

  // ---- Deleting a child with a login deletes the login too ----
  const teenEmail2 = `ash2.${stamp}@test.local`;
  await p.getByLabel(`${teen.first_name}'s own email`).fill(teenEmail2);
  await p.getByRole("button", { name: `Invite ${teen.first_name} to their own login` }).click();
  await p.waitForURL(/invited=1/);
  const [linked] = await api(`/rest/v1/players?id=eq.${teen.id}&select=user_id`, undefined, "GET");
  await p.getByRole("button", { name: /Delete .* and everything about them/ }).click();
  await p.check("input[name=confirmDelete]");
  await p.getByRole("button", { name: "Delete permanently" }).click();
  await p.waitForURL(/\/dashboard\?deleted=/);
  let loginGone = false;
  try {
    await api(`/auth/v1/admin/users/${linked.user_id}`, undefined, "GET");
  } catch (e) {
    loginGone = e.status === 404;
  }
  check(Boolean(linked.user_id) && loginGone, "deleting the child also deleted their login");
} catch (e) {
  console.log("✗ crashed:", e.message);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
