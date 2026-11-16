import {
  Bot,
  BookOpenText,
  Clock3,
  FolderLock,
  GraduationCap,
  LayoutDashboard,
  MapPinned,
  Receipt,
  Settings,
  Wrench,
} from "lucide-react";
import type { Feature } from "@/lib/plans";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: typeof LayoutDashboard;
  feature?: Feature;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", short: "Home", icon: LayoutDashboard },
  { href: "/timesheets", label: "Timesheets", short: "Hours", icon: Clock3 },
  { href: "/diary", label: "Work Diary", short: "Diary", icon: BookOpenText },
  { href: "/job-sites", label: "Job Sites", short: "Sites", icon: MapPinned },
  { href: "/progress", label: "Apprenticeship", short: "Progress", icon: GraduationCap },
  { href: "/tools", label: "Tools", short: "Tools", icon: Wrench },
  { href: "/expenses", label: "Expenses", short: "Expenses", icon: Receipt, feature: "expenses" },
  { href: "/documents", label: "Documents", short: "Docs", icon: FolderLock, feature: "documents" },
  { href: "/assistant", label: "AI Assistant", short: "Assistant", icon: Bot, feature: "ai_assistant" },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
];

/** Bottom-bar destinations on mobile (the clock button sits in the middle). */
export const MOBILE_PRIMARY = ["/dashboard", "/timesheets", "/diary"] as const;
