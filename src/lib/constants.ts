import type { CompetencyStatus, DocumentCategory, ExpenseCategory, ToolCondition, ToolStatus, Trade } from "@/lib/types";

export const TRADES: { value: Trade; label: string }[] = [
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "carpentry", label: "Carpentry" },
  { value: "automotive", label: "Automotive" },
  { value: "refrigeration", label: "Refrigeration & air conditioning" },
  { value: "other", label: "Other trade" },
];

export const STATES = [
  { value: "NSW", label: "New South Wales", timezone: "Australia/Sydney" },
  { value: "VIC", label: "Victoria", timezone: "Australia/Melbourne" },
  { value: "QLD", label: "Queensland", timezone: "Australia/Brisbane" },
  { value: "WA", label: "Western Australia", timezone: "Australia/Perth" },
  { value: "SA", label: "South Australia", timezone: "Australia/Adelaide" },
  { value: "TAS", label: "Tasmania", timezone: "Australia/Hobart" },
  { value: "ACT", label: "Australian Capital Territory", timezone: "Australia/Sydney" },
  { value: "NT", label: "Northern Territory", timezone: "Australia/Darwin" },
] as const;

export const TIMEZONES = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Darwin",
  "Australia/Perth",
  "Australia/Hobart",
  "Australia/Lord_Howe",
  "Australia/Broken_Hill",
];

export const COMPETENCY_STATUSES: { value: CompetencyStatus; label: string; tone: "neutral" | "primary" | "warning" | "success" }[] = [
  { value: "not_started", label: "Not started", tone: "neutral" },
  { value: "learning", label: "Learning", tone: "primary" },
  { value: "practised", label: "Practised", tone: "primary" },
  { value: "awaiting_signoff", label: "Awaiting sign-off", tone: "warning" },
  { value: "completed", label: "Completed", tone: "success" },
];

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "tools", label: "Tools" },
  { value: "ppe", label: "PPE" },
  { value: "fuel", label: "Fuel" },
  { value: "training", label: "Training" },
  { value: "equipment", label: "Equipment" },
  { value: "other", label: "Other" },
];

export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "licence", label: "Licence" },
  { value: "certificate", label: "Certificate" },
  { value: "training_record", label: "Training record" },
  { value: "employment", label: "Employment" },
  { value: "assessment", label: "Assessment" },
  { value: "other", label: "Other" },
];

export const TOOL_STATUSES: { value: ToolStatus; label: string; tone: "success" | "primary" | "danger" | "warning" | "neutral" }[] = [
  { value: "available", label: "Available", tone: "success" },
  { value: "lent", label: "Lent out", tone: "primary" },
  { value: "damaged", label: "Damaged", tone: "warning" },
  { value: "lost", label: "Missing", tone: "danger" },
  { value: "retired", label: "Retired", tone: "neutral" },
];

export const TOOL_CONDITIONS: { value: ToolCondition; label: string }[] = [
  { value: "new", label: "New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

export const TOOL_CATEGORIES = [
  "Hand tools",
  "Power tools",
  "Test equipment",
  "Measuring",
  "Ladders & access",
  "PPE",
  "Storage",
  "Other",
];

/**
 * Optional starter checklist categories per trade. These are generic skill areas to help users
 * organise their own records, NOT official units of competency or qualification structures.
 */
export const STARTER_CATEGORIES: Record<Trade, string[]> = {
  electrical: [
    "Safety & isolation",
    "Cabling & wiring",
    "Power & lighting",
    "Switchboards & protection",
    "Testing & verification",
    "Fault finding",
    "Data & communications",
    "Documentation",
  ],
  plumbing: ["Safety", "Water services", "Sanitary drainage", "Stormwater", "Gas fitting", "Roofing", "Hot water systems", "Documentation"],
  carpentry: ["Safety", "Framing", "Formwork", "Roofing", "Doors & windows", "Stairs", "Finishing", "Setting out"],
  automotive: ["Safety", "Servicing", "Brakes", "Suspension & steering", "Engine systems", "Electrical systems", "Diagnostics", "Documentation"],
  refrigeration: ["Safety", "Refrigerant handling", "Brazing & pipework", "Electrical controls", "Installation", "Commissioning", "Fault finding", "Documentation"],
  other: ["Safety", "Core skills", "Tools & equipment", "Documentation"],
};

export const DASHBOARD_CARDS = [
  { value: "clock", label: "Clock in / out" },
  { value: "hours", label: "Hours this week & month" },
  { value: "progress", label: "Apprenticeship progress" },
  { value: "diary", label: "Recent diary entries" },
  { value: "sites", label: "Recent job sites" },
  { value: "deadlines", label: "Upcoming deadlines" },
  { value: "expenses", label: "Recent expenses" },
  { value: "reminders", label: "Reminders & alerts" },
] as const;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
