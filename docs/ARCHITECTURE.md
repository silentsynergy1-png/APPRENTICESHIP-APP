# Apprentice OS: architecture

## Overview

```
Browser / installed PWA
  │  Next.js pages (server-rendered per request, never cached across users)
  │  Client components for interactive pieces (clock, diary editor, chat)
  │  Direct-to-storage uploads (RLS-checked) • IndexedDB queue for offline diary drafts
  ▼
Next.js server (Vercel)
  │  proxy.ts → refreshes the Supabase session cookie, redirects signed-out users
  │  Server actions (all writes) → zod validation → Supabase as the signed-in user
  │  Route handlers → AI, exports (CSV/PDF), reverse geocoding, billing, account deletion
  │  Secrets stay here: Anthropic, geocoder, Supabase secret key, Stripe
  ▼
Supabase
     Auth (email + password, email confirmation)
     Postgres with Row Level Security on every table
     Private storage bucket `user-files/<user_id>/…`, served only through short-lived signed URLs
```

Rendering choice: every screen shows private, per-user data, so Next's Cache Components are deliberately off and pages render dynamically. Nothing user-specific is stored in a shared server cache.

## Data model (key tables)

| Area | Tables |
| --- | --- |
| Account | `profiles`, `work_rules` (user-configured ordinary hours and overtime), `public_holidays`, `subscriptions` |
| Work | `employers`, `job_sites`, `work_sessions` (clock-in/out location fields), `breaks`, `timesheet_adjustments` (audit trail) |
| Diary | `work_diary_entries` (generated full-text `search` column), `diary_photos` |
| Progress | `apprenticeships`, `competency_categories`, `competencies`, `competency_records` (practice, sign-off, note), `tafe_assessments`, `learning_goals`, `milestones` |
| Kit & money | `tools`, `tool_maintenance`, `receipts`, `expenses`, `documents` |
| Engagement | `reminders`, `notifications`, `push_subscriptions`, `weekly_recaps` |
| AI | `ai_conversations`, `ai_messages`, `ai_usage` (daily quota) |

All user-owned rows have `user_id`, `created_at` and `updated_at` (via trigger), plus check constraints on lengths, ranges and enums.

## Security model

- **RLS everywhere:** owners can only read and change rows where `user_id = auth.uid()`. `anon` has no table access.
- **Composite foreign keys** (`(child.parent_id, child.user_id) → parent(id, user_id)`) stop a user attaching their rows to someone else's records, which RLS alone can't prevent, because FK checks bypass RLS.
- **Database-enforced rules:** one active clock-in per user (partial unique index), sessions at most 24 h, end after start, file paths must sit in the owner's folder.
- **Read-only to clients:** `subscriptions` (written only by the Stripe webhook with the service role), `ai_usage` (atomic `consume_ai_quota`), `timesheet_adjustments` (written by trigger). Notifications allow updating only `read_at` and `dismissed_at`.
- **Audit trail:** a trigger records before/after values for timesheet times, employer, site, status and location edits. A reason applies to exactly one edit.
- **Storage:** private bucket, per-user folder policies, signed URLs (≤1 h). Files are deleted with their records and on account deletion.
- **Server actions** re-check the session, validate with zod, never log payloads, and return friendly errors.
- **Rate limits:** AI requests use a per-user daily quota in the database. Geocoding uses a per-user per-minute limiter.
- **Headers:** `X-Frame-Options: DENY`, `nosniff`, a strict `Referrer-Policy`, and `Permissions-Policy` limiting geolocation and camera to this origin.
- **Privacy:** location is read once per clock-in, clock-out or "Update location" (no `watchPosition`), with accuracy, source (`gps`/`manual`) and capture time stored. Users can correct or remove it. Employers can't access anything. Full JSON export and account deletion are in Settings.

## Key user journeys

1. **Clock in:** tap Clock in → a one-time explainer before the first permission prompt → GPS fix (12 s timeout) → server saves the session with press-time, coordinates and accuracy → reverse-geocodes server-side → matches saved job sites (radius plus GPS accuracy, capped) → UI shows the approximate address with confirm, correct, remove and save-as-site options. Denied or failed GPS never blocks clocking in.
2. **Clock out:** closes any open break → computes worked time → offers a diary entry prefilled from the session. Forgotten clock-outs are flagged after the user's own limit and closed with a manual finish time, which is marked for review.
3. **Diary:** rough notes → optional "Improve with AI" (structured output, faithful to the notes, clarifying questions instead of guesses) → user edits → save → photos. Offline: saved to IndexedDB, synced idempotently via `client_id`.
4. **Progress:** custom categories and competencies with five statuses. Practice and sign-off records are clearly personal records. Diary entries suggest matching competencies, but logging needs confirmation and never marks anything completed.
5. **Money & kit:** receipt photo → AI extraction → user confirms → expense saved. GST is only taken from the receipt, and nothing is labelled deductible.

## Time calculations

`src/lib/time/calc.ts` works on absolute instants, subtracts unpaid breaks as intervals, splits at local midnights in the session's IANA timezone, then categorises each day using the user's rules: daily and/or weekly ordinary caps, separate weekends, and user-defined public holidays. Unit tests cover both Sydney daylight-saving transitions and overnight shifts across them.

## Plans

`src/lib/plans.ts` defines Free and Pro features and limits in one place. Gates are enforced on the server (actions, route handlers) and reflected in the UI. Stripe Checkout and the webhook are implemented but stay disabled until `STRIPE_ENABLED=true`.

## Future: employer accounts

Planned as separate `organizations` and `organization_members` tables, with **explicit, per-record sharing** granted by the apprentice (e.g. submitting a timesheet week to an employer). It would not broaden RLS on apprentice tables. Location data would be excluded from employer views unless the apprentice opts in separately.
