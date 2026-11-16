# Project rules for Claude Code

## What we are building
MatchClip: a mobile-first web app that makes detailed match analysis available to every footballer, not just academy players. Players (many under 18, some adults) at any level, local or representative, upload a match video, tap themselves on a frame, and get back short clips of their key moments. A coach reviews each clip (AI only suggests), writes a strength note and a work-on note per moment, and sends a report with scores, strengths, work-ons and a drill for each work-on. Players can see a tag on each clip (e.g. Beaten 1v1, Passing, Duels). Clubs should be able to use it too later, not just academies.

The owner is a football coach, not a developer. Explain things in plain English, keep steps small, and say what to run and what you changed.

## Brand
The working name is MatchClip (Instagram @matchclipapp). Trademark, domain and handle checks are still open, so never hard-code the name. Keep it in one file, `src/config/brand.ts` (name, tagline, support email, domain). Everything that shows the name reads from there. Brand: dark green-black (#0D1411) background, lime accent (#C8F04A), orange (#F5A94A) for work-on items.

## Stack (change only if you explain why)
- Next.js (App Router) with TypeScript, Tailwind CSS
- Supabase for auth, Postgres and storage, in the Sydney region (ap-southeast-2)
- Video: Mux or Cloudflare Stream (decide in the plan; resumable uploads, clips cut from timestamps)
- Stripe subscriptions (later phase), Resend for email, Vercel for hosting
- Package manager: npm

## Roles
parent, player, coach, admin. At launch there is one coach (the owner). Design the database so a coach directory and more coaches can be added later without a rebuild.

## Child safety rules (these come before features)
- Under-18s need a parent or guardian account that gives consent. A parent can see their child's videos, clips and reports and can delete everything.
- Videos and clips are private by default. No public links. Any share link must expire.
- Only the player, their linked parent and assigned coaches can view a player's video. Coaches only see players assigned to them.
- Enforce this with Supabase row-level security, not just in the UI. Write tests for each role.
- Log every staff access to a minor's video.
- Collect only what is needed. No precise location.
- Deleting an account must really delete the files, not just hide them.
- The AI never shows anything to a player. A coach approves first.
- Do not send children's footage to any AI service until the owner has checked that provider's data terms.

## Report and player actions
- A report has: four scores set by the coach (starter categories: Passing, Duels, Positioning, Decision making; coach can change them), strengths, work-ons, and one drill per work-on.
- Each clip has a coach note (strength) and optionally a work-on note, plus a tag. The coach writes these. Never auto-publish AI text.
- The player can tap "Set as my focus this week" on a work-on, and "Share with my coach" to send the report or a clip to their own coach (for example at their club). Sharing must use expiring, permissioned links, never public ones.
- On the "tap yourself" screen, the player picks their team's shape (4-4-2 or 4-3-3) and taps their position and shirt number. Store shape, kit colour and shirt number with the match.
- For v1 the coach adds the tracking ring and tags by hand. No automatic player tracking yet.

## Tags and search
- Tags are their own table linked to clips. Starter list: Beaten 1v1, Passing, Duels, First touch, Positioning, Defending, Transition.
- Record who set each tag (ai or coach). Coach-confirmed tags are the trusted ones.
- Search only returns clips the signed-in user is allowed to see. Check this in the database rules.

## Working style
- Before writing code for a new feature, give a short plan and wait for approval.
- Build in small steps. After each step: run the app, run tests, and tell the owner how to check it works.
- Never commit secrets. Use `.env.local`, and keep a `.env.example` with fake values.
- Use fake or sample videos in development. Never use real footage of children while building. Do not use broadcast footage (for example LOITV or Wyscout) in the app or its tests; the owner's own demo clips are for marketing only.
- Keep a `docs/decisions.md` file. Add a line whenever a choice is made (what, why).
- Commit often with clear messages.

## Not in scope for launch
Fully automated reviews with no coach, coach directory and coach sign-up, native iOS/Android apps, team or club accounts. Design the database so club accounts (a club with several coaches and players) can be added later without a rebuild.

## Reference
The prototype (look and flow only; sample data) and the Build Brief are the source of truth for screens. If something is unclear, ask the owner before guessing.
