# Web app

Mobile-first web app for coach-reviewed match clips. The product name lives in
`src/config/brand.ts`. Project rules are in `CLAUDE.md`; decisions are in `docs/decisions.md`.

## Run it on a computer

1. Install Node.js (version 20 or newer) from nodejs.org.
2. In this folder, run `npm install` (first time only).
3. Copy `.env.example` to `.env.local` and fill in the real values.
4. Run `npm run dev` and open http://localhost:3000.

## Checks

- `npm test` runs the automatic tests.
- `npm run lint` checks code style.
- `npm run build` checks the app builds for the internet.

## Where things are

| What | Where |
|---|---|
| Product name, tagline, support email, domain | `src/config/brand.ts` |
| Age rules (13 / 18) | `src/config/age-rules.ts` |
| Brand colours | `src/app/globals.css` |
| Pages | `src/app/` |
| Tests | `tests/` |
