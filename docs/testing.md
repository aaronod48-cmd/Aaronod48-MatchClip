# Testing

All tests run against fake data. Nothing here touches the real Supabase project.

| Command | What it checks |
|---|---|
| `npm test` | App rules: brand name in one place, age rules, sign-up checks, password rules, safe links. |
| `npm run test:db` | Database: tables, locked by default, and what each role can see and change. Needs the local database (below). |
| `npm run test:e2e` | A real browser signs up, verifies by email, logs in/out and resets a password. Needs the local Supabase + app running (below). |
| `npm run test:e2e:child` | A parent adds a child with consent, withdraws and gives consent again (checking the coach's access each time), and deletes the child. Same key needed as below. |
| `npm run test:e2e:teen` | A parent invites a 13–17-year-old; the teen accepts by email and sets a password; checks what the teen sees, consent withdrawal, removing the login, and deleting a child with a login. Run the app with `SUPABASE_SECRET_KEY` set to the local secret key. |
| `npm run test:e2e:upload` | A parent adds a match and uploads a half using a PRETEND video service (run the app with `VIDEO_PROVIDER=fake`); adult player profile; strangers can't see it; deleting it. Nothing is sent to Mux. |
| `npm run test:e2e:tap` | Upload a half, pick a moment, tap yourself, save, send to the coach; checks nothing can change afterwards. Pretend video service (`VIDEO_PROVIDER=fake`). |
| `npm run test:e2e:review` | Coach review: make yourself default coach, open a match, make clips (times, ring, tags, notes), edit, delete, publish; another coach is refused; staff views logged. Pretend video service. |
| `npm run test:e2e:tags` | Admin adds, renames, reorders and hides tags; duplicates refused; a parent can't open the screen. |
| `npm run test:e2e:clips` | What a parent sees on a published match: only published clips, only coach-confirmed tags, lime/orange notes, the ring at its moment, 'being prepared' for uncut clips; strangers refused. Pretend video service. |
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
VIDEO_PROVIDER=fake SUPABASE_SECRET_KEY=<local secret key> npx next start -p 3000
NODE_PATH=$(npm root -g) npm run test:e2e
SUPABASE_LOCAL_SECRET_KEY=<local secret key> NODE_PATH=$(npm root -g) npm run test:e2e:homes
SUPABASE_LOCAL_SECRET_KEY=<local secret key> NODE_PATH=$(npm root -g) npm run test:e2e:child
SUPABASE_LOCAL_SECRET_KEY=<local secret key> NODE_PATH=$(npm root -g) npm run test:e2e:teen
SUPABASE_LOCAL_SECRET_KEY=<local secret key> NODE_PATH=$(npm root -g) npm run test:e2e:upload
SUPABASE_LOCAL_SECRET_KEY=<local secret key> NODE_PATH=$(npm root -g) npm run test:e2e:tap
SUPABASE_LOCAL_SECRET_KEY=<local secret key> NODE_PATH=$(npm root -g) npm run test:e2e:review
SUPABASE_LOCAL_SECRET_KEY=<local secret key> NODE_PATH=$(npm root -g) npm run test:e2e:tags
SUPABASE_LOCAL_SECRET_KEY=<local secret key> NODE_PATH=$(npm root -g) npm run test:e2e:clips
```

The homes test refuses to run against anything except a local Supabase.

If a browser test can't find something on screen, make sure no old copy of the app is still running (`fuser -k 3000/tcp`) and rebuild.

## Database changes reach the real Supabase automatically

When a change in `supabase/migrations/` reaches `main`, the **Update database** job on GitHub (Actions tab) first runs every database check on a throwaway copy, then applies the change to the real project.
