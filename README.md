# Apprentice OS

The all-in-one apprenticeship platform for Australian trade apprentices: location-aware clock-in, timesheets, work diary with AI writing, apprenticeship progress, tools, expenses, documents, an AI study assistant and weekly recaps. It's an installable, mobile-first PWA.

- **Stack:** Next.js 16 (App Router, TypeScript), Tailwind CSS v4, Radix UI (shadcn-style components), Recharts, Lucide icons
- **Backend:** Supabase (Auth, Postgres with Row Level Security, private Storage), Next.js server actions and route handlers
- **AI:** Anthropic Claude, server-side only
- **Payments:** Stripe-ready, and switched off until `STRIPE_ENABLED=true`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design, data model and security model.

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

### 1. Create the Supabase database

**New project:** open Supabase → **SQL Editor** → **New query**, paste the whole of [`supabase/setup_all.sql`](supabase/setup_all.sql) and click **Run**. Run it once.

**Existing project:** run only the migration files in `supabase/migrations/` that were added since your last setup, in filename order. Each new file is safe to run once.

`setup_all.sql` is generated from the migrations with `npm run db:bundle`.

### 2. Configure Supabase Auth

- **Authentication → URL Configuration:** set **Site URL** to your app URL and add `<your-url>/auth/confirm` to **Redirect URLs**. Use `http://localhost:3000/auth/confirm` for local development.
- **Authentication → Sign In / Providers → Email:** keep **Confirm email** on in production. It can be turned off temporarily for automated testing.

### 3. Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Publishable (anon) key. Safe in the browser, because RLS protects data |
| `SUPABASE_SECRET_KEY` | for deletion / Stripe | Service-role key. **Server only.** Used for account deletion and the Stripe webhook |
| `NEXT_PUBLIC_SITE_URL` | ✅ in prod | Public URL, used in Stripe redirects |
| `ANTHROPIC_API_KEY` | for AI | Enables AI diary writing, assistant, receipt scanning and weekly AI summaries. **Leave unset to run in no-AI mode**: every AI button, page and marketing mention is hidden |
| `AI_DISABLED` | optional | `true` forces no-AI mode even if a key is set |
| `ANTHROPIC_MODEL` | optional | Defaults to `claude-opus-5-5`. A cheaper model can be set here |
| `GEOCODER_PROVIDER` | optional | `mapbox`, `google`, `nominatim` or `none` (default) |
| `MAPBOX_ACCESS_TOKEN` / `GOOGLE_MAPS_API_KEY` | with provider | Reverse-geocoding key. **Server only** |
| `NOMINATIM_USER_AGENT` | with nominatim | Identify your app per the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/). Fine for testing; use Mapbox or Google in production |
| `BETA_ALL_PRO` | optional | `true` unlocks Pro for every account (closed beta, no payments) |
| `STRIPE_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY` | later | Turn on real payments only after the product is fully tested |

Without the optional keys the app still works. Each feature clearly says when it isn't configured, and nothing is faked.

### Giving a test account Pro (no payments)

Either set `BETA_ALL_PRO=true`, or run in the SQL editor:

```sql
update public.subscriptions set plan = 'pro', status = 'active'
where user_id = (select id from auth.users where email = 'someone@example.com');
```

---

## Testing

| Command | What it covers |
| --- | --- |
| `npm test` | Unit tests: time maths (incl. Sydney DST changes), overtime/weekend/holiday rules, geo matching, apprenticeship timeline |
| `npm run test:db` | Applies every migration to a scratch Postgres and checks RLS isolation, cross-user FK protection, the one-active-clock-in rule, audit trail, quotas, notifications and cascade deletes. Needs a local Postgres (`PGHOST`, `PGPORT`) |
| `npm run typecheck`, `npm run lint` | Static checks |
| `node e2e/flow.cjs` | End-to-end against a running app and real Supabase: sign-up, onboarding, GPS clock-in, breaks, job-site recognition, clock-out, manual sessions, edits and audit history, exports, two-user isolation |
| `node e2e/diary.cjs` | Diary: session-linked entry, private photo upload (and not publicly reachable), search, calendar, offline draft that syncs exactly once |
| `node e2e/progress.cjs` | Progress centre: competencies, sign-offs, assessments, goals, milestones, diary-to-competency practice logging |
| `node e2e/modules.cjs` | Tools, expenses (receipts, CSV/PDF), documents, notifications and reminders, assistant, recap. Run the app with `BETA_ALL_PRO=true` |

E2E tests need Playwright (`npm i -D playwright` or a global install). They create throwaway users `e2e-…@apprenticeos.test`, so email confirmation must be off while they run. Delete those users afterwards in Supabase → Authentication → Users.

---

## Deployment (Vercel)

1. Import the GitHub repo into Vercel (framework: Next.js).
2. Add the environment variables above (Production and Preview).
3. Deploy, then set the Supabase **Site URL** and **Redirect URLs** to the production domain.
4. Optional: set up Stripe (product "Pro", AUD $7.99/month). Add the webhook endpoint `https://<domain>/api/billing/webhook` for `checkout.session.completed` and `customer.subscription.*`, then set `STRIPE_ENABLED=true`.

The app is a PWA: on a phone, open it in the browser and use **Add to Home Screen**.

---

## Project layout

```
src/
  app/
    (auth)/            sign in, sign up, password reset
    (app)/             signed-in app: dashboard, timesheets, diary, job-sites, progress,
                       tools, expenses, documents, assistant, notifications, recap, settings
    api/               AI (diary, receipt, chat), exports, geocoding, billing, account deletion
    onboarding/        first-run setup
  components/          UI kit (shadcn-style), app shell, clock panel, charts
  lib/
    time/calc.ts       timezone-aware hours engine (unit tested)
    geo/               distance and job-site matching, pluggable reverse geocoder
    ai/client.ts       shared AI guard: plan check, daily quota, safety rules
    plans.ts           Free/Pro entitlements: the single place to change what's in each plan
    supabase/          server, browser and admin clients
supabase/
  migrations/          schema, RLS and storage policies (source of truth)
  setup_all.sql        all migrations bundled for the SQL editor
  tests/               RLS and integrity tests against real Postgres
e2e/                   Playwright end-to-end suites
```
