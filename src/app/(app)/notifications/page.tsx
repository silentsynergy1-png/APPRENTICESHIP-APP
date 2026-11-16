import Link from "next/link";
import type { Metadata } from "next";
import { Settings2 } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import type { NotificationRow, Reminder } from "@/lib/types";
import { NotificationList, ReminderPanel } from "./client";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireAppContext();
  await ctx.supabase.rpc("refresh_notifications");
  const [{ data: notes }, { data: reminders }] = await Promise.all([
    ctx.supabase.from("notifications").select("*").is("dismissed_at", null).order("created_at", { ascending: false }).limit(100),
    ctx.supabase.from("reminders").select("*").order("completed_at", { nullsFirst: true }).order("due_at").limit(100),
  ]);
  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Deadlines, expiries and reminders, so nothing sneaks up on you."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings/notifications">
              <Settings2 /> Preferences
            </Link>
          </Button>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <NotificationList items={(notes ?? []) as NotificationRow[]} timezone={ctx.profile.timezone} />
        <ReminderPanel reminders={(reminders ?? []) as Reminder[]} timezone={ctx.profile.timezone} />
      </div>
    </div>
  );
}
