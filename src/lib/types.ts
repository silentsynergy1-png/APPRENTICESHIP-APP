// Row types for the tables the app reads. Kept in sync with supabase/migrations.
export type Trade = "electrical" | "plumbing" | "carpentry" | "automotive" | "refrigeration" | "other";
export type LocationSource = "gps" | "manual" | "none";
export type ApprovalStatus = "draft" | "submitted" | "approved" | "rejected";
export type OvertimeMode = "none" | "daily" | "weekly" | "daily_and_weekly";
export type CompetencyStatus = "not_started" | "learning" | "practised" | "completed" | "awaiting_signoff";
export type ExpenseCategory = "tools" | "ppe" | "fuel" | "training" | "equipment" | "other";
export type DocumentCategory = "licence" | "certificate" | "training_record" | "employment" | "assessment" | "other";
export type ToolStatus = "available" | "lent" | "lost" | "damaged" | "retired";
export type ToolCondition = "new" | "good" | "fair" | "poor";
export type PlanTier = "free" | "pro";

export type DashboardCard = "clock" | "hours" | "progress" | "diary" | "sites" | "deadlines" | "expenses" | "reminders";

export interface Profile {
  id: string;
  full_name: string | null;
  trade: Trade;
  state: string | null;
  timezone: string;
  location_enabled: boolean;
  onboarding_completed: boolean;
  dashboard_cards: DashboardCard[];
  notification_prefs: Record<string, boolean>;
}

export interface WorkRules {
  user_id: string;
  daily_ordinary_hours: number;
  weekly_ordinary_hours: number;
  overtime_mode: OvertimeMode;
  separate_weekend: boolean;
  week_starts_on: number;
  forgotten_clock_out_hours: number;
  timesheet_due_weekday: number | null;
}

export interface Employer {
  id: string;
  name: string;
  abn: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  supervisor_name: string | null;
  supervisor_phone: string | null;
  supervisor_email: string | null;
  supervisor_licence: string | null;
  is_primary: boolean;
  archived: boolean;
  notes: string | null;
}

export interface JobSite {
  id: string;
  employer_id: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  match_radius_m: number;
  description: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
}

export interface WorkSession {
  id: string;
  user_id: string;
  employer_id: string | null;
  job_site_id: string | null;
  started_at: string;
  ended_at: string | null;
  timezone: string;
  status: "active" | "completed";
  source: "clock" | "manual";
  approval_status: ApprovalStatus;
  needs_review: boolean;
  review_reason: string | null;
  notes: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  start_accuracy_m: number | null;
  start_address: string | null;
  start_location_source: LocationSource;
  start_location_captured_at: string | null;
  end_latitude: number | null;
  end_longitude: number | null;
  end_accuracy_m: number | null;
  end_address: string | null;
  end_location_source: LocationSource;
  end_location_captured_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Break {
  id: string;
  session_id: string;
  started_at: string;
  ended_at: string | null;
  kind: "paid" | "unpaid";
}

export type SessionWithBreaks = WorkSession & { breaks: Break[] };

export interface DiaryEntry {
  id: string;
  client_id: string | null;
  session_id: string | null;
  employer_id: string | null;
  job_site_id: string | null;
  entry_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string | null;
  raw_notes: string | null;
  description: string | null;
  tasks: string[];
  skills: string[];
  tools_used: string[];
  materials: string[];
  personal_notes: string | null;
  lessons_learned: string | null;
  status: "draft" | "final";
  ai_assisted: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiaryPhoto {
  id: string;
  entry_id: string;
  storage_path: string;
  caption: string | null;
  mime_type: string;
  size_bytes: number;
  is_attachment: boolean;
  created_at: string;
}

export interface Apprenticeship {
  id: string;
  trade: Trade;
  qualification: string | null;
  qualification_code: string | null;
  start_date: string;
  expected_completion_date: string;
  employer_id: string | null;
  training_provider: string | null;
  is_current: boolean;
  notes: string | null;
}

export interface CompetencyCategory {
  id: string;
  name: string;
  sort_order: number;
}

export interface Competency {
  id: string;
  apprenticeship_id: string | null;
  category_id: string | null;
  code: string | null;
  title: string;
  description: string | null;
  is_tafe_unit: boolean;
  status: CompetencyStatus;
  target_date: string | null;
  completed_on: string | null;
  updated_at: string;
}

export interface CompetencyRecord {
  id: string;
  competency_id: string;
  diary_entry_id: string | null;
  record_type: "practice" | "signoff" | "note";
  occurred_on: string;
  supervisor_name: string | null;
  supervisor_licence: string | null;
  notes: string | null;
  created_at: string;
}

export interface TafeAssessment {
  id: string;
  competency_id: string | null;
  title: string;
  due_at: string;
  status: "upcoming" | "submitted" | "passed" | "resubmit" | "cancelled";
  notes: string | null;
}

export interface LearningGoal {
  id: string;
  title: string;
  notes: string | null;
  target_date: string | null;
  status: "active" | "achieved" | "dropped";
  achieved_on: string | null;
}

export interface Milestone {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  achieved_on: string | null;
}

export interface Tool {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  category: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  warranty_expires_on: string | null;
  condition: ToolCondition;
  status: ToolStatus;
  photo_path: string | null;
  receipt_path: string | null;
  next_maintenance_on: string | null;
  notes: string | null;
  created_at: string;
}

export interface ToolMaintenance {
  id: string;
  tool_id: string;
  performed_on: string;
  description: string;
  cost: number | null;
}

export interface Expense {
  id: string;
  receipt_id: string | null;
  spent_on: string;
  merchant: string | null;
  amount: number;
  gst_amount: number | null;
  category: ExpenseCategory;
  description: string | null;
  work_notes: string | null;
  items: { description: string; amount: number | null }[];
  from_ai_extraction: boolean;
  created_at: string;
}

export interface Receipt {
  id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
}

export interface DocumentRow {
  id: string;
  title: string;
  category: DocumentCategory;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  issued_on: string | null;
  expires_on: string | null;
  notes: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link_path: string | null;
  due_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export interface Reminder {
  id: string;
  title: string;
  notes: string | null;
  due_at: string;
  completed_at: string | null;
}

export interface AiConversation {
  id: string;
  title: string;
  updated_at: string;
}

export interface AiMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  saved: boolean;
  created_at: string;
}

export interface PublicHoliday {
  id: string;
  holiday_date: string;
  name: string;
}
