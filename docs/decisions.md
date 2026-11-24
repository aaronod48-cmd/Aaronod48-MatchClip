# Decisions

One line per decision: what was decided, and why. Newest at the bottom.

| Date | Decision | Why |
|---|---|---|
| 2026-11-16 | Stack: Next.js (App Router) + TypeScript + Tailwind, Supabase (Sydney, ap-southeast-2), Vercel, npm. | Set in CLAUDE.md. Sydney keeps data in Australia. |
| 2026-11-16 | Product name, tagline, support email and domain live only in `src/config/brand.ts`; a test fails if the name is typed anywhere else. | Name/trademark/domain checks are still open. |
| 2026-11-16 | Brand colours are defined once in `src/app/globals.css` (`pitch`, `lime`, `workon`). | One place to change the look. |
| 2026-11-16 | Age rules in `src/config/age-rules.ts`: under 13 = parent account only; 13–17 = parent may invite child to own login (parent still sees and can delete everything); 18+ = can sign up alone. | Owner's choice; kept in one file in case the lawyer wants a different line. |
| 2026-11-16 | Store a child's birth year, not full date of birth. Age is worked out using the younger possible age. | Collect only what is needed; never treat a child as older than they are. |
| 2026-11-16 | Public sign-up only for parents and adult players. Coach and admin roles can only be given by an admin. | Nobody can make themselves a coach. |
| 2026-11-16 | Video provider: Mux, **pending a data-terms check** (where video is stored, how it's used). No child's video goes to any provider until the owner approves. Only fake/sample video until then. | Mux has resumable phone uploads, clips cut from timestamps, and expiring signed playback links. |
| 2026-11-16 | Consent wording drafted in plain English by Claude; a lawyer checks it before launch. | Australia's Children's Online Privacy Code is coming. |
| 2026-11-16 | Pages ask search engines not to index the app. | Private app used by children. |
| 2026-11-16 | Tests use Vitest (`npm test`). | Simple, fast, works with TypeScript. |
| 2026-11-16 | Supabase settings (Project URL + publishable key) go straight into Vercel's Environment Variables; the owner never pastes keys into chat. The secret/service_role key is not used by the app yet. | Keeps keys out of chat and out of GitHub. The publishable key is safe to be public; row-level security protects the data. |
| 2026-11-16 | Home page shows a "Setup check" box that tests the Supabase connection on each visit, with a plain-English reason if it fails. | Lets the owner confirm setup without technical tools. |
| 2026-11-17 | Logo redrawn as SVG from the owner's 1080px PNG (original kept in `docs/brand/`). Logo symbol at `public/brand/logo-mark.svg`, path set in `brand.ts`; shown beside the name (name is text, read from `brand.ts`). Browser-tab icon `src/app/icon.svg`, phone home-screen icon `src/app/apple-icon.png`. | SVG stays sharp at any size with a transparent background; logo has no words, so the name stays in one place. |
| 2026-11-17 | Database changes are written as migration files in `supabase/migrations/` and tested on a local copy of Supabase (`npx supabase db reset`, then `npm run test:db`) before reaching the real database. | Real data is never used for testing; every change is repeatable. |
| 2026-11-17 | Logins (`profiles`) and footballers (`players`) are separate tables. Under-13s are a `players` row with no login. | Matches the age rules: young children never have their own account. |
| 2026-11-17 | Player stores first name, birth year and optional team only. Shirt number, shape and kit colour are stored per match (Week 2). | Collect only what's needed; shirt numbers change between matches. |
| 2026-11-17 | Every table has row-level security ON from creation, with no access rules until Step 4. A test checks no table is ever left unlocked. | Locked by default; nothing is exposed by mistake. |
| 2026-11-17 | Sign-up can only create a parent or a player; asking for coach/admin gives parent. | Nobody can make themselves staff. |
| 2026-11-17 | When the last guardian of a player with no login is removed, the player and their consent records are deleted automatically. | Deleting an account must really delete; nothing left with nobody responsible. Lawyer to confirm whether consent records must be kept for a period. |
| 2026-11-17 | Clubs are prepared for with `organisations` + `organisation_members` (one "Independent coaching" organisation at launch); coach access goes through `coach_assignments`. | Clubs and more coaches can be added later without a rebuild. |
| 2026-11-17 | Each login has one role for now. | Simple; can become several roles later if someone is e.g. both parent and coach. |
| 2026-11-17 | Admins manage accounts, roles and coach assignments but do NOT automatically see players' videos; an admin can be assigned as a coach (so the owner needs only one login). | CLAUDE.md: only the player, their parent and assigned coaches view a player's video. |
| 2026-11-17 | A coach can see an under-18 player only while assigned AND while a parent's consent is active. Withdrawing consent or ending the assignment removes access immediately. | Child safety comes before features. |
| 2026-11-17 | Not-logged-in visitors have no access to any table. Logged-in users can only edit specific columns (e.g. a parent can change a child's name but not attach a login). | Locked down by default. |
| 2026-11-17 | Only admins can change roles, enforced by a database trigger. | Nobody can promote themselves. |
| 2026-11-17 | Children and consents can't be created directly; Step 7 adds a checked function that does both together. | A child can never exist without the consent step. |
| 2026-11-17 | Teens (13–17) with their own login can see but not edit their own record; their parent edits it. Adults can edit their own. | Parent stays in control of a minor's data. |
| 2026-11-17 | The staff access log can't be edited or deleted by anyone through the app, including admins. Parents can read the log for their own child. | A trustworthy record; transparency for parents. |
| 2026-11-17 | Age numbers exist in both `src/config/age-rules.ts` and the database; a test fails if they ever differ. | Change in one place without the two drifting apart (change both, the test reminds you). |
| 2026-11-24 | Real Supabase is connected to GitHub: migrations in `supabase/migrations/` are applied automatically when they reach `main`. | No copying SQL by hand; the real database always matches the tested files. |
| 2026-11-24 | Sign-in settings in `supabase/config.toml`: email must be verified before logging in; passwords at least 10 characters with letters and numbers; changing a password needs a recent login. | Safe defaults for an app used by families. |
| 2026-11-24 | Steps 3–4 were applied to the real database by pasting `supabase/manual/week1-apply-once.sql` into the SQL Editor (the GitHub integration only made preview copies). Owner confirmed all 9 tables have row-level security ON. Future changes: set up an automatic GitHub Action before the next database change. | The free GitHub integration didn't deploy to production. |
| 2026-11-24 | Sign-up asks "Parent or guardian" or "Player aged 18+" and requires ticking "I am 18 or over". Under-18s can't sign up themselves; a parent adds them (Step 7). | Every self-made account is an adult; children come in only through a parent with consent. |
| 2026-11-24 | Email verification links come back to `/auth/callback`. If the link is opened in a different browser or app (common on phones), the email still counts as verified and the person is asked to log in. | Works reliably on phones without editing Supabase's email templates. |
| 2026-11-24 | Sign-up and "forgot password" show the same message whether or not the email already has an account. | Nobody can use the forms to find out who is a member. |
| 2026-11-24 | Links in emails can only send people to pages inside this site. | Stops a tampered link bouncing someone to another website. |
| 2026-11-24 | A browser test (`e2e/auth-flow.mjs`) checks the whole sign-in journey against a local Supabase, including the emails. | Proves it works end to end, not just piece by piece. |
| 2026-11-24 | Supabase's built-in email sender is used for now (only a few emails per hour). Switch to Resend before launch. | Fine for testing; not enough for real users. |
