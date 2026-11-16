import { requireAppContext } from "@/lib/auth";
import { getActiveSession } from "@/lib/data/sessions";
import { AppShell } from "@/components/shell/app-shell";
import { PLANS } from "@/lib/plans";
import type { Employer, JobSite } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAppContext();
  const [session, employers, sites, unread] = await Promise.all([
    getActiveSession(ctx),
    ctx.supabase.from("employers").select("id, name, is_primary").eq("archived", false).order("is_primary", { ascending: false }).order("name"),
    ctx.supabase.from("job_sites").select("id, name, employer_id").eq("archived", false).order("name"),
    ctx.supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).is("dismissed_at", null),
  ]);

  return (
    <AppShell
      user={{ name: ctx.profile.full_name, tier: ctx.entitlements.tier }}
      unreadCount={unread.count ?? 0}
      features={PLANS[ctx.entitlements.tier].features}
      clock={{
        session,
        employers: (employers.data ?? []) as Pick<Employer, "id" | "name" | "is_primary">[],
        jobSites: (sites.data ?? []) as Pick<JobSite, "id" | "name" | "employer_id">[],
        locationEnabled: ctx.profile.location_enabled,
        timezone: ctx.profile.timezone,
        forgottenHours: ctx.rules.forgotten_clock_out_hours,
      }}
    >
      {children}
    </AppShell>
  );
}
