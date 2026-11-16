"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings", label: "Profile & location" },
  { href: "/settings/work", label: "Work rules" },
  { href: "/settings/employers", label: "Employers" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/plan", label: "Plan" },
  { href: "/settings/data", label: "Privacy & data" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:flex-col lg:px-0" aria-label="Settings">
      {ITEMS.map((i) => {
        const on = pathname === i.href;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-[13.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              on && "bg-card text-foreground shadow-soft ring-1 ring-border",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
