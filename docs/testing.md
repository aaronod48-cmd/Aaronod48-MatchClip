# Testing

All tests run against fake data. Nothing here touches the real Supabase project.

| Command | What it checks |
|---|---|
| `npm test` | App rules: brand name in one place, age rules, sign-up checks, password rules, safe links. |
| `npm run test:db` | Database: tables, locked by default, and what each role can see and change. Needs the local database (below). |
| `npm run test:e2e` | A real browser signs up, verifies by email, logs in/out and resets a password. Needs the local Supabase + app running (below). |
| `npm run test:e2e:homes` | Logs in as a parent, player, coach and admin and checks each sees the right home screen and nothing they shouldn't. Needs `SUPABASE_LOCAL_SECRET_KEY` (the local demo key from `npx supabase status`). |

## Local Supabase (needs Docker)

```bash
npx supabase start -x studio,storage-api,imgproxy,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta
npx supabase db reset   # rebuilds the local database from supabase/migrations
```

`npx supabase status` shows the local URL and publishable key (standard demo values, not secret).
Emails sent locally are caught at http://127.0.0.1:54324 (Mailpit) instead of being delivered.

## Running the app against local Supabase for the browser test

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local key> npm run build
npx next start -p 3000
NODE_PATH=$(npm root -g) npm run test:e2e
SUPABASE_LOCAL_SECRET_KEY=<local secret key> NODE_PATH=$(npm root -g) npm run test:e2e:homes
```

The homes test refuses to run against anything except a local Supabase.
