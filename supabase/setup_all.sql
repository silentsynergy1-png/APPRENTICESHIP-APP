-- Apprentice OS: complete database setup (all migrations combined).
-- Paste this ENTIRE file into Supabase → SQL Editor and click Run. Run it once.


-- ===================== supabase/migrations/20261116000001_core_schema.sql =====================
-- Apprentice OS — core schema
-- Every user-owned table carries user_id, created_at and updated_at.
-- Child tables use composite foreign keys (child.parent_id, child.user_id) -> parent(id, user_id)
-- so a user can never attach their rows to another user's records, even though
-- foreign-key checks bypass Row Level Security.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- array_to_string is only STABLE in general; for text[] it is safe to treat as immutable,
-- which lets us use it inside the generated full-text search column.
create or replace function public.text_array_join(arr text[])
returns text
language sql
immutable
parallel safe
as $$ select array_to_string(arr, ' ') $$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.trade as enum (
  'electrical', 'plumbing', 'carpentry', 'automotive', 'refrigeration', 'other'
);
create type public.location_source as enum ('gps', 'manual', 'none');
create type public.session_status as enum ('active', 'completed');
create type public.session_source as enum ('clock', 'manual');
create type public.approval_status as enum ('draft', 'submitted', 'approved', 'rejected');
create type public.break_kind as enum ('unpaid', 'paid');
create type public.overtime_mode as enum ('none', 'daily', 'weekly', 'daily_and_weekly');
create type public.diary_status as enum ('draft', 'final');
create type public.competency_status as enum (
  'not_started', 'learning', 'practised', 'completed', 'awaiting_signoff'
);
create type public.assessment_status as enum ('upcoming', 'submitted', 'passed', 'resubmit', 'cancelled');
create type public.goal_status as enum ('active', 'achieved', 'dropped');
create type public.tool_status as enum ('available', 'lent', 'lost', 'damaged', 'retired');
create type public.tool_condition as enum ('new', 'good', 'fair', 'poor');
create type public.expense_category as enum ('tools', 'ppe', 'fuel', 'training', 'equipment', 'other');
create type public.document_category as enum (
  'licence', 'certificate', 'training_record', 'employment', 'assessment', 'other'
);
create type public.plan_tier as enum ('free', 'pro');
create type public.ai_role as enum ('user', 'assistant');

-- ---------------------------------------------------------------------------
-- Profiles & settings
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  trade public.trade not null default 'electrical',
  state text check (state in ('NSW','VIC','QLD','WA','SA','TAS','ACT','NT')),
  timezone text not null default 'Australia/Sydney',
  location_enabled boolean not null default true,
  onboarding_completed boolean not null default false,
  dashboard_cards jsonb not null default
    '["clock","hours","progress","diary","sites","deadlines","expenses","reminders"]'::jsonb,
  notification_prefs jsonb not null default
    '{"assessments":true,"timesheets":true,"milestones":true,"warranties":true,"documents":true,"goals":true,"forgotten_clock_out":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Employment rules are configured by the user. Nothing here is a universal entitlement.
create table public.work_rules (
  user_id uuid primary key references auth.users (id) on delete cascade,
  daily_ordinary_hours numeric(4,2) not null default 7.6 check (daily_ordinary_hours between 0 and 24),
  weekly_ordinary_hours numeric(5,2) not null default 38 check (weekly_ordinary_hours between 0 and 168),
  overtime_mode public.overtime_mode not null default 'daily_and_weekly',
  separate_weekend boolean not null default true,
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6), -- 0 = Sunday
  forgotten_clock_out_hours numeric(4,2) not null default 14 check (forgotten_clock_out_hours between 1 and 24),
  timesheet_due_weekday smallint check (timesheet_due_weekday between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  holiday_date date not null,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, holiday_date)
);

-- ---------------------------------------------------------------------------
-- Employers & job sites
-- ---------------------------------------------------------------------------
create table public.employers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  abn text check (abn ~ '^[0-9 ]{11,14}$'),
  phone text check (char_length(phone) <= 40),
  email text check (char_length(email) <= 200),
  address text check (char_length(address) <= 300),
  supervisor_name text check (char_length(supervisor_name) <= 120),
  supervisor_phone text check (char_length(supervisor_phone) <= 40),
  supervisor_email text check (char_length(supervisor_email) <= 200),
  supervisor_licence text check (char_length(supervisor_licence) <= 60),
  is_primary boolean not null default false,
  archived boolean not null default false,
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index employers_user_idx on public.employers (user_id) where not archived;

create table public.job_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  employer_id uuid,
  name text not null check (char_length(name) between 1 and 160),
  address text check (char_length(address) <= 300),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  match_radius_m integer not null default 150 check (match_radius_m between 25 and 5000),
  description text check (char_length(description) <= 2000),
  notes text check (char_length(notes) <= 4000),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (employer_id, user_id) references public.employers (id, user_id) on delete set null (employer_id),
  check ((latitude is null) = (longitude is null))
);
create index job_sites_user_idx on public.job_sites (user_id) where not archived;

-- ---------------------------------------------------------------------------
-- Work sessions (timesheets)
-- ---------------------------------------------------------------------------
create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  employer_id uuid,
  job_site_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  timezone text not null default 'Australia/Sydney',
  status public.session_status generated always as
    (case when ended_at is null then 'active'::public.session_status else 'completed'::public.session_status end) stored,
  source public.session_source not null default 'clock',
  approval_status public.approval_status not null default 'draft',
  needs_review boolean not null default false,
  review_reason text check (char_length(review_reason) <= 300),
  notes text check (char_length(notes) <= 4000),
  -- Optional note explaining the most recent edit; copied into the audit trail by trigger.
  change_reason text check (char_length(change_reason) <= 500),

  -- Clock-in location (captured once, only when the user clocks in)
  start_latitude double precision check (start_latitude between -90 and 90),
  start_longitude double precision check (start_longitude between -180 and 180),
  start_accuracy_m double precision check (start_accuracy_m >= 0),
  start_address text check (char_length(start_address) <= 300),
  start_location_source public.location_source not null default 'none',
  start_location_captured_at timestamptz,

  -- Clock-out location (captured once, only when the user clocks out)
  end_latitude double precision check (end_latitude between -90 and 90),
  end_longitude double precision check (end_longitude between -180 and 180),
  end_accuracy_m double precision check (end_accuracy_m >= 0),
  end_address text check (char_length(end_address) <= 300),
  end_location_source public.location_source not null default 'none',
  end_location_captured_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (employer_id, user_id) references public.employers (id, user_id) on delete set null (employer_id),
  foreign key (job_site_id, user_id) references public.job_sites (id, user_id) on delete set null (job_site_id),
  check (ended_at is null or ended_at > started_at),
  check (ended_at is null or ended_at - started_at <= interval '24 hours'),
  check ((start_latitude is null) = (start_longitude is null)),
  check ((end_latitude is null) = (end_longitude is null))
);
-- The database itself guarantees only one open clock-in per user.
create unique index work_sessions_one_active_per_user on public.work_sessions (user_id) where ended_at is null;
create index work_sessions_user_started_idx on public.work_sessions (user_id, started_at desc);
create index work_sessions_job_site_idx on public.work_sessions (job_site_id) where job_site_id is not null;

create table public.breaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  kind public.break_kind not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, user_id) references public.work_sessions (id, user_id) on delete cascade,
  check (ended_at is null or ended_at > started_at)
);
create unique index breaks_one_active_per_session on public.breaks (session_id) where ended_at is null;
create index breaks_session_idx on public.breaks (session_id);

-- Audit trail for timesheet changes. Written by trigger, never by the client.
create table public.timesheet_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.work_sessions (id) on delete set null,
  action text not null check (action in ('insert', 'update', 'delete')),
  changes jsonb not null,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);
create index timesheet_adjustments_session_idx on public.timesheet_adjustments (session_id);
create index timesheet_adjustments_user_idx on public.timesheet_adjustments (user_id, created_at desc);

create or replace function public.audit_work_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tracked text[] := array['started_at','ended_at','employer_id','job_site_id','approval_status',
                          'start_address','end_address','start_latitude','end_latitude'];
  diff jsonb := '{}'::jsonb;
  col text;
  old_j jsonb;
  new_j jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.timesheet_adjustments (user_id, session_id, action, changes)
    values (new.user_id, new.id, 'insert',
      jsonb_build_object('started_at', new.started_at, 'source', new.source));
    return new;
  elsif tg_op = 'DELETE' then
    -- When the whole account is being deleted (cascade from auth.users) there is nothing to audit.
    if not exists (select 1 from auth.users u where u.id = old.user_id) then
      return old;
    end if;
    insert into public.timesheet_adjustments (user_id, session_id, action, changes)
    values (old.user_id, null, 'delete',
      jsonb_build_object('session_id', old.id, 'started_at', old.started_at, 'ended_at', old.ended_at));
    return old;
  end if;

  old_j := to_jsonb(old);
  new_j := to_jsonb(new);
  foreach col in array tracked loop
    if old_j -> col is distinct from new_j -> col then
      diff := diff || jsonb_build_object(col, jsonb_build_object('from', old_j -> col, 'to', new_j -> col));
    end if;
  end loop;

  if diff <> '{}'::jsonb then
    insert into public.timesheet_adjustments (user_id, session_id, action, changes, reason)
    values (new.user_id, new.id, 'update', diff, nullif(new.change_reason, ''));
  end if;
  return new;
end;
$$;

create trigger work_sessions_audit
after insert or update or delete on public.work_sessions
for each row execute function public.audit_work_session();

-- ---------------------------------------------------------------------------
-- Work diary
-- ---------------------------------------------------------------------------
create table public.work_diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid, -- idempotency key for offline drafts
  session_id uuid,
  employer_id uuid,
  job_site_id uuid,
  entry_date date not null,
  start_time time,
  end_time time,
  title text check (char_length(title) <= 200),
  raw_notes text check (char_length(raw_notes) <= 8000),
  description text check (char_length(description) <= 12000),
  tasks text[] not null default '{}',
  skills text[] not null default '{}',
  tools_used text[] not null default '{}',
  materials text[] not null default '{}',
  personal_notes text check (char_length(personal_notes) <= 8000),
  lessons_learned text check (char_length(lessons_learned) <= 8000),
  status public.diary_status not null default 'draft',
  ai_assisted boolean not null default false,
  search tsvector generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(raw_notes, '') || ' ' ||
      coalesce(lessons_learned, '') || ' ' || coalesce(personal_notes, '') || ' ' ||
      public.text_array_join(tasks) || ' ' || public.text_array_join(skills) || ' ' ||
      public.text_array_join(tools_used) || ' ' || public.text_array_join(materials))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, client_id),
  foreign key (session_id, user_id) references public.work_sessions (id, user_id) on delete set null (session_id),
  foreign key (employer_id, user_id) references public.employers (id, user_id) on delete set null (employer_id),
  foreign key (job_site_id, user_id) references public.job_sites (id, user_id) on delete set null (job_site_id),
  check (cardinality(tasks) <= 100 and cardinality(skills) <= 100
         and cardinality(tools_used) <= 100 and cardinality(materials) <= 100)
);
create index diary_user_date_idx on public.work_diary_entries (user_id, entry_date desc);
create index diary_session_idx on public.work_diary_entries (session_id) where session_id is not null;
create index diary_search_idx on public.work_diary_entries using gin (search);

create table public.diary_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_id uuid not null,
  storage_path text not null check (char_length(storage_path) <= 500),
  caption text check (char_length(caption) <= 300),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 15728640),
  is_attachment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (entry_id, user_id) references public.work_diary_entries (id, user_id) on delete cascade,
  check (storage_path like user_id::text || '/%')
);
create index diary_photos_entry_idx on public.diary_photos (entry_id);
create index diary_photos_user_idx on public.diary_photos (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Apprenticeship progress
-- ---------------------------------------------------------------------------
create table public.apprenticeships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trade public.trade not null,
  qualification text check (char_length(qualification) <= 200),
  qualification_code text check (char_length(qualification_code) <= 40),
  start_date date not null,
  expected_completion_date date not null,
  employer_id uuid,
  training_provider text check (char_length(training_provider) <= 200),
  is_current boolean not null default true,
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (employer_id, user_id) references public.employers (id, user_id) on delete set null (employer_id),
  check (expected_completion_date > start_date)
);
create unique index apprenticeships_one_current on public.apprenticeships (user_id) where is_current;

create table public.competency_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.competencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  apprenticeship_id uuid,
  category_id uuid,
  code text check (char_length(code) <= 40),
  title text not null check (char_length(title) between 1 and 250),
  description text check (char_length(description) <= 4000),
  is_tafe_unit boolean not null default false,
  status public.competency_status not null default 'not_started',
  target_date date,
  completed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (apprenticeship_id, user_id) references public.apprenticeships (id, user_id) on delete set null (apprenticeship_id),
  foreign key (category_id, user_id) references public.competency_categories (id, user_id) on delete set null (category_id)
);
create index competencies_user_idx on public.competencies (user_id, status);

-- Practice logs and supervisor sign-offs. A sign-off here is the apprentice's own record of
-- a sign-off, not an official assessment.
create table public.competency_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  competency_id uuid not null,
  diary_entry_id uuid,
  record_type text not null check (record_type in ('practice', 'signoff', 'note')),
  occurred_on date not null,
  supervisor_name text check (char_length(supervisor_name) <= 120),
  supervisor_licence text check (char_length(supervisor_licence) <= 60),
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (competency_id, user_id) references public.competencies (id, user_id) on delete cascade,
  foreign key (diary_entry_id, user_id) references public.work_diary_entries (id, user_id) on delete set null (diary_entry_id),
  check (record_type <> 'signoff' or supervisor_name is not null)
);
create index competency_records_comp_idx on public.competency_records (competency_id, occurred_on desc);

create table public.tafe_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  apprenticeship_id uuid,
  competency_id uuid,
  title text not null check (char_length(title) between 1 and 250),
  due_at timestamptz not null,
  status public.assessment_status not null default 'upcoming',
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (apprenticeship_id, user_id) references public.apprenticeships (id, user_id) on delete set null (apprenticeship_id),
  foreign key (competency_id, user_id) references public.competencies (id, user_id) on delete set null (competency_id)
);
create index tafe_assessments_due_idx on public.tafe_assessments (user_id, due_at);

create table public.learning_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 250),
  notes text check (char_length(notes) <= 4000),
  target_date date,
  status public.goal_status not null default 'active',
  achieved_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_goals_user_idx on public.learning_goals (user_id, status);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 2000),
  target_date date,
  achieved_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index milestones_user_idx on public.milestones (user_id, target_date);

-- ---------------------------------------------------------------------------
-- Tools
-- ---------------------------------------------------------------------------
create table public.tools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  brand text check (char_length(brand) <= 80),
  model text check (char_length(model) <= 80),
  serial_number text check (char_length(serial_number) <= 120),
  category text check (char_length(category) <= 80),
  purchase_date date,
  purchase_price numeric(10,2) check (purchase_price >= 0),
  warranty_expires_on date,
  condition public.tool_condition not null default 'good',
  status public.tool_status not null default 'available',
  photo_path text check (photo_path like user_id::text || '/%'),
  receipt_path text check (receipt_path like user_id::text || '/%'),
  next_maintenance_on date,
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index tools_user_idx on public.tools (user_id, status);

create table public.tool_maintenance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tool_id uuid not null,
  performed_on date not null,
  description text not null check (char_length(description) between 1 and 1000),
  cost numeric(10,2) check (cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tool_id, user_id) references public.tools (id, user_id) on delete cascade
);
create index tool_maintenance_tool_idx on public.tool_maintenance (tool_id, performed_on desc);

-- ---------------------------------------------------------------------------
-- Expenses & receipts
-- ---------------------------------------------------------------------------
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null check (storage_path like user_id::text || '/%'),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 15728640),
  extraction jsonb, -- AI-extracted values, shown for confirmation only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  receipt_id uuid,
  spent_on date not null,
  merchant text check (char_length(merchant) <= 160),
  amount numeric(10,2) not null check (amount >= 0 and amount < 100000000),
  gst_amount numeric(10,2) check (gst_amount >= 0),
  category public.expense_category not null default 'other',
  description text check (char_length(description) <= 500),
  work_notes text check (char_length(work_notes) <= 2000),
  items jsonb not null default '[]'::jsonb,
  from_ai_extraction boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (receipt_id, user_id) references public.receipts (id, user_id) on delete set null (receipt_id),
  check (gst_amount is null or gst_amount <= amount)
);
create index expenses_user_date_idx on public.expenses (user_id, spent_on desc);

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  category public.document_category not null default 'other',
  storage_path text not null check (storage_path like user_id::text || '/%'),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 26214400),
  issued_on date,
  expires_on date,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_user_idx on public.documents (user_id, category);
create index documents_expiry_idx on public.documents (user_id, expires_on) where expires_on is not null;

-- ---------------------------------------------------------------------------
-- Reminders & notifications
-- ---------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text check (char_length(notes) <= 2000),
  due_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reminders_user_due_idx on public.reminders (user_id, due_at) where completed_at is null;

-- In-app notifications. Generated from deadlines/reminders by refresh_notifications();
-- dedupe_key stops the same alert appearing twice. Push delivery can read from here later.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('assessment','timesheet','milestone','warranty','document',
                                     'goal','reminder','forgotten_clock_out','maintenance','system')),
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 1000),
  link_path text check (link_path like '/%'),
  due_at timestamptz,
  dedupe_key text not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc) where dismissed_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- ---------------------------------------------------------------------------
-- AI
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null,
  role public.ai_role not null,
  content text not null check (char_length(content) <= 60000),
  saved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.ai_conversations (id, user_id) on delete cascade
);
create index ai_messages_conv_idx on public.ai_messages (conversation_id, created_at);
create index ai_messages_saved_idx on public.ai_messages (user_id) where saved;

-- Per-user daily AI request counter (rate limiting / cost control).
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0,
  primary key (user_id, usage_date)
);

create table public.weekly_recaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  stats jsonb not null,
  summary text check (char_length(summary) <= 12000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- ---------------------------------------------------------------------------
-- Subscriptions (written only by the server / Stripe webhook via service role)
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan public.plan_tier not null default 'free',
  status text not null default 'active'
    check (status in ('active','trialing','past_due','canceled','incomplete')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','work_rules','public_holidays','employers','job_sites','work_sessions','breaks',
    'work_diary_entries','diary_photos','apprenticeships','competency_categories','competencies',
    'competency_records','tafe_assessments','learning_goals','milestones','tools','tool_maintenance',
    'receipts','expenses','documents','reminders','notifications','push_subscriptions',
    'ai_conversations','ai_messages','weekly_recaps','subscriptions'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_updated_at', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- New user bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''));
  insert into public.work_rules (user_id) values (new.id);
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ===================== supabase/migrations/20261116000002_rls_and_functions.sql =====================
-- Apprentice OS — Row Level Security and server-side functions
-- Default posture: every table has RLS enabled, anon gets nothing, authenticated users
-- see and change only rows where user_id = auth.uid().

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','work_rules','public_holidays','employers','job_sites','work_sessions','breaks',
    'timesheet_adjustments','work_diary_entries','diary_photos','apprenticeships',
    'competency_categories','competencies','competency_records','tafe_assessments',
    'learning_goals','milestones','tools','tool_maintenance','receipts','expenses','documents',
    'reminders','notifications','push_subscriptions','ai_conversations','ai_messages',
    'ai_usage','weekly_recaps','subscriptions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Standard owner policies (full CRUD on own rows)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'public_holidays','employers','job_sites','work_sessions','breaks','work_diary_entries',
    'diary_photos','apprenticeships','competency_categories','competencies','competency_records',
    'tafe_assessments','learning_goals','milestones','tools','tool_maintenance','receipts',
    'expenses','documents','reminders','push_subscriptions','ai_conversations','ai_messages',
    'weekly_recaps'
  ] loop
    execute format($f$
      create policy %I on public.%I for select to authenticated
        using (user_id = (select auth.uid()))$f$, t || '_select_own', t);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
        with check (user_id = (select auth.uid()))$f$, t || '_insert_own', t);
    execute format($f$
      create policy %I on public.%I for update to authenticated
        using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$f$,
      t || '_update_own', t);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
        using (user_id = (select auth.uid()))$f$, t || '_delete_own', t);
  end loop;
end;
$$;

-- Profiles: created by trigger, readable/updatable by owner, deleted via auth.users cascade.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy work_rules_select_own on public.work_rules for select to authenticated
  using (user_id = (select auth.uid()));
create policy work_rules_update_own on public.work_rules for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Audit trail: read-only for the owner. Rows are written by the security-definer trigger.
create policy timesheet_adjustments_select_own on public.timesheet_adjustments for select to authenticated
  using (user_id = (select auth.uid()));

-- Notifications: generated by refresh_notifications(); owner can read, mark read, dismiss, delete.
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- Usage counters and subscriptions are read-only to the client.
create policy ai_usage_select_own on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));
create policy subscriptions_select_own on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Notification columns the client may change are limited to read/dismiss state.
revoke update on public.notifications from authenticated;
grant update (read_at, dismissed_at) on public.notifications to authenticated;

-- Profiles: the client may not flip arbitrary columns (e.g. id).
revoke update on public.profiles from authenticated;
grant update (full_name, trade, state, timezone, location_enabled, onboarding_completed,
              dashboard_cards, notification_prefs) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- consume_ai_quota: atomic per-user daily counter used to rate-limit AI calls.
-- Returns true if the request is allowed (and counts it), false if the limit is reached.
-- ---------------------------------------------------------------------------
create or replace function public.consume_ai_quota(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_count integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.ai_usage as u (user_id, usage_date, request_count)
  values (uid, (now() at time zone 'Australia/Sydney')::date, 1)
  on conflict (user_id, usage_date)
    do update set request_count = u.request_count + 1
    where u.request_count < p_limit
  returning request_count into new_count;
  return new_count is not null;
end;
$$;
revoke all on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- job_site_stats: sessions and worked minutes per job site (RLS applies: security invoker)
-- ---------------------------------------------------------------------------
create or replace function public.job_site_stats()
returns table (job_site_id uuid, session_count bigint, worked_minutes numeric, last_worked_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select s.job_site_id,
         count(*) as session_count,
         round(sum(
           extract(epoch from (s.ended_at - s.started_at)) / 60
           - coalesce((select sum(extract(epoch from (b.ended_at - b.started_at)) / 60)
                       from public.breaks b
                       where b.session_id = s.id and b.kind = 'unpaid' and b.ended_at is not null), 0)
         )::numeric, 1) as worked_minutes,
         max(s.started_at) as last_worked_at
  from public.work_sessions s
  where s.job_site_id is not null and s.ended_at is not null
  group by s.job_site_id
$$;
grant execute on function public.job_site_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- refresh_notifications: derive in-app alerts from the user's own deadlines.
-- Idempotent (dedupe_key), respects notification_prefs, only touches the caller's rows.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prefs jsonb;
  tz text;
  rules record;
  inserted integer := 0;
  n integer;
  local_today date;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.notification_prefs, p.timezone into prefs, tz from public.profiles p where p.id = uid;
  select * into rules from public.work_rules w where w.user_id = uid;
  tz := coalesce(tz, 'Australia/Sydney');
  local_today := (now() at time zone tz)::date;

  if coalesce((prefs ->> 'assessments')::boolean, true) then
    insert into public.notifications (user_id, kind, title, body, link_path, due_at, dedupe_key)
    select uid, 'assessment', 'Assessment due: ' || left(a.title, 150),
           'Due ' || to_char(a.due_at at time zone tz, 'Dy DD Mon, HH12:MI AM'),
           '/progress', a.due_at, 'assessment:' || a.id || ':' || (a.due_at at time zone tz)::date
    from public.tafe_assessments a
    where a.user_id = uid and a.status = 'upcoming'
      and a.due_at between now() - interval '1 day' and now() + interval '14 days'
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics n = row_count; inserted := inserted + n;
  end if;

  insert into public.notifications (user_id, kind, title, body, link_path, due_at, dedupe_key)
  select uid, 'reminder', left(r.title, 200), r.notes, '/notifications', r.due_at,
         'reminder:' || r.id || ':' || r.due_at
  from public.reminders r
  where r.user_id = uid and r.completed_at is null and r.due_at <= now() + interval '3 days'
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics n = row_count; inserted := inserted + n;

  if coalesce((prefs ->> 'warranties')::boolean, true) then
    insert into public.notifications (user_id, kind, title, body, link_path, due_at, dedupe_key)
    select uid, 'warranty', 'Warranty ending: ' || left(t.name, 150),
           'Warranty expires ' || to_char(t.warranty_expires_on, 'DD Mon YYYY'),
           '/tools/' || t.id, t.warranty_expires_on::timestamptz,
           'warranty:' || t.id || ':' || t.warranty_expires_on
    from public.tools t
    where t.user_id = uid and t.status not in ('lost', 'retired')
      and t.warranty_expires_on between local_today and local_today + 30
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics n = row_count; inserted := inserted + n;

    insert into public.notifications (user_id, kind, title, body, link_path, due_at, dedupe_key)
    select uid, 'maintenance', 'Maintenance due: ' || left(t.name, 150),
           'Scheduled for ' || to_char(t.next_maintenance_on, 'DD Mon YYYY'),
           '/tools/' || t.id, t.next_maintenance_on::timestamptz,
           'maintenance:' || t.id || ':' || t.next_maintenance_on
    from public.tools t
    where t.user_id = uid and t.status not in ('lost', 'retired')
      and t.next_maintenance_on <= local_today + 7
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics n = row_count; inserted := inserted + n;
  end if;

  if coalesce((prefs ->> 'documents')::boolean, true) then
    insert into public.notifications (user_id, kind, title, body, link_path, due_at, dedupe_key)
    select uid, 'document', 'Expiring soon: ' || left(d.title, 150),
           'Expires ' || to_char(d.expires_on, 'DD Mon YYYY'),
           '/documents', d.expires_on::timestamptz, 'document:' || d.id || ':' || d.expires_on
    from public.documents d
    where d.user_id = uid and d.expires_on between local_today - 1 and local_today + 60
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics n = row_count; inserted := inserted + n;
  end if;

  if coalesce((prefs ->> 'goals')::boolean, true) then
    insert into public.notifications (user_id, kind, title, body, link_path, due_at, dedupe_key)
    select uid, 'goal', 'Learning goal target: ' || left(g.title, 150),
           'Target date ' || to_char(g.target_date, 'DD Mon YYYY'),
           '/progress', g.target_date::timestamptz, 'goal:' || g.id || ':' || g.target_date
    from public.learning_goals g
    where g.user_id = uid and g.status = 'active' and g.target_date between local_today and local_today + 7
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics n = row_count; inserted := inserted + n;
  end if;

  if coalesce((prefs ->> 'milestones')::boolean, true) then
    insert into public.notifications (user_id, kind, title, body, link_path, due_at, dedupe_key)
    select uid, 'milestone', 'Milestone coming up: ' || left(m.title, 150),
           'Target ' || to_char(m.target_date, 'DD Mon YYYY'),
           '/progress', m.target_date::timestamptz, 'milestone:' || m.id || ':' || m.target_date
    from public.milestones m
    where m.user_id = uid and m.achieved_on is null and m.target_date between local_today and local_today + 14
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics n = row_count; inserted := inserted + n;
  end if;

  if coalesce((prefs ->> 'forgotten_clock_out')::boolean, true) then
    insert into public.notifications (user_id, kind, title, body, link_path, due_at, dedupe_key)
    select uid, 'forgotten_clock_out', 'Still clocked in?',
           'You clocked in at ' || to_char(s.started_at at time zone tz, 'HH12:MI AM Dy DD Mon')
             || '. Clock out and set the correct finish time.',
           '/timesheets', now(), 'forgot:' || s.id
    from public.work_sessions s
    where s.user_id = uid and s.ended_at is null
      and s.started_at < now() - make_interval(secs => coalesce(rules.forgotten_clock_out_hours, 14) * 3600)
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics n = row_count; inserted := inserted + n;
  end if;

  if coalesce((prefs ->> 'timesheets')::boolean, true)
     and rules.timesheet_due_weekday is not null
     and extract(dow from local_today) = rules.timesheet_due_weekday then
    insert into public.notifications (user_id, kind, title, body, link_path, due_at, dedupe_key)
    select uid, 'timesheet', 'Timesheet due today',
           count(*) || ' session(s) from the last 7 days are still drafts.',
           '/timesheets', now(), 'timesheet:' || local_today
    from public.work_sessions s
    where s.user_id = uid and s.approval_status = 'draft' and s.ended_at is not null
      and s.started_at > now() - interval '7 days'
    having count(*) > 0
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics n = row_count; inserted := inserted + n;
  end if;

  return inserted;
end;
$$;
revoke all on function public.refresh_notifications() from public, anon;
grant execute on function public.refresh_notifications() to authenticated;

-- ===================== supabase/migrations/20261116000003_storage.sql =====================
-- Apprentice OS — private file storage
-- One private bucket. Every object path must start with the owner's user id:
--   <user_id>/<area>/<uuid>.<ext>   (area: diary | receipts | tools | documents)
-- Files are only ever served through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-files', 'user-files', false, 26214400,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update set public = false;

create policy "user_files_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "user_files_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "user_files_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "user_files_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
