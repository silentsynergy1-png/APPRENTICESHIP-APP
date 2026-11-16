# Your to-do list

Things only you can do (accounts, keys, settings). Tick them off as you go and tell Claude when each is done. Never paste secret keys into a chat; they go in Vercel's settings (or `.env.local` on your own computer).

## A. Do soon (about 20 minutes)

- [ ] **1. Run one database update.** In Supabase → SQL Editor → New query, paste the contents of
      [`supabase/migrations/20261117000001_change_reason_once.sql`](../supabase/migrations/20261117000001_change_reason_once.sql) and click **Run**. Safe to run more than once.
- [ ] **2. Turn email confirmation back on.** Supabase → Authentication → Sign In / Providers → Email → **Confirm email: ON** → Save.
- [ ] **3. Delete the test accounts.** Supabase → Authentication → Users → delete every user whose email starts with `e2e-`.
- [ ] **4. Get an Anthropic API key** (turns on AI diary writing, receipt scanning, the assistant and weekly recaps).
      console.anthropic.com → sign up → add a payment method and set a monthly spend limit → **API Keys → Create key**. Keep it somewhere safe. You'll paste it into Vercel in step 7.

## B. Put it online (about 30–60 minutes)

- [ ] **5. Buy a domain**, e.g. `apprenticeos.com.au` (`.com.au` needs an ABN) or a `.com`.
- [ ] **6. Create a Vercel account** at vercel.com (sign in with GitHub) → **Add New → Project** → import `apprenticeship-app`.
- [ ] **7. Add environment variables in Vercel** (Project → Settings → Environment Variables):
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://battemqaobyqngzfksvq.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = your publishable key
  - `SUPABASE_SECRET_KEY` = Supabase → Project Settings → API Keys → **secret** key (needed for account deletion)
  - `NEXT_PUBLIC_SITE_URL` = `https://your-domain`
  - `ANTHROPIC_API_KEY` = the key from step 4
  - `GEOCODER_PROVIDER` = `mapbox` and `MAPBOX_ACCESS_TOKEN` = your Mapbox token (step 9)
  - optional for a free beta: `BETA_ALL_PRO` = `true`
- [ ] **8. Connect your domain** in Vercel (Project → Settings → Domains) and follow its DNS instructions.
      Then in Supabase → Authentication → URL Configuration: set **Site URL** to `https://your-domain` and add `https://your-domain/auth/confirm` to **Redirect URLs**.
- [ ] **9. Get a Mapbox token** (turns GPS into street addresses; free tier is plenty to start).
      mapbox.com → sign up → Account → **Tokens** → copy the default public token, or create one. Add it in step 7.

## C. Before inviting real users

- [ ] **10. Test it yourself on your phone** at your real domain: sign up, install to home screen, clock in and out at work, write a diary entry with a photo, add a tool and an expense.
- [ ] **11. Decide on the beta plan:** free Pro for everyone (`BETA_ALL_PRO=true`), or Free only for now.
- [ ] **12. Ask Claude for:** a full privacy policy and terms of use to review (ideally have a lawyer look over them), and a support email address to show in the app.

## D. Later (when you're ready)

- [ ] **Stripe payments:** create a Stripe account, verify your business, create the "Pro" product at AUD $7.99/month, then ask Claude to switch payments on.
- [ ] **Google Play Store:** Play Console developer account, then ask Claude for the store package, screenshots, descriptions and the website verification file. Decide whether the Android app is Free-only or uses Google Play Billing.
- [ ] **iPhone App Store:** a later, separate project once people are paying.
- [ ] **Push notifications to phones:** ask Claude when you want reminders to reach your lock screen.

## What Claude has already done
Everything else: all features, database security, offline diary, exports, the install prompt, and tests for all of it.
