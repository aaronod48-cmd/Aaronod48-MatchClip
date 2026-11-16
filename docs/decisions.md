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
