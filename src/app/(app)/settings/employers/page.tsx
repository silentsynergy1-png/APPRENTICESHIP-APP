import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/misc";
import type { Employer } from "@/lib/types";
import { EmployerDialog, EmployerArchiveButton } from "./employer-dialog";

export const metadata: Metadata = { title: "Employers" };

export default async function EmployersPage() {
  const ctx = await requireAppContext();
  const { data } = await ctx.supabase.from("employers").select("*").order("archived").order("is_primary", { ascending: false }).order("name");
  const employers = (data ?? []) as Employer[];

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[14px] text-muted-foreground">Employers and the supervisors who sign off your work.</p>
        <EmployerDialog />
      </div>
      {employers.length ? (
        employers.map((e) => (
          <Card key={e.id} className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold">{e.name}</span>
                  {e.is_primary ? <Badge tone="primary">Primary</Badge> : null}
                  {e.archived ? <Badge>Archived</Badge> : null}
                </div>
                <div className="mt-1 space-y-0.5 text-[13px] text-muted-foreground">
                  {e.abn ? <div>ABN {e.abn.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, "$1 $2 $3 $4")}</div> : null}
                  {e.address ? <div>{e.address}</div> : null}
                  {e.supervisor_name ? (
                    <div>
                      Supervisor: <span className="text-foreground">{e.supervisor_name}</span>
                      {e.supervisor_licence ? ` · Licence ${e.supervisor_licence}` : ""}
                      {e.supervisor_phone ? ` · ${e.supervisor_phone}` : ""}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2">
                <EmployerDialog employer={e} />
                <EmployerArchiveButton id={e.id} archived={e.archived} />
              </div>
            </div>
          </Card>
        ))
      ) : (
        <EmptyState icon={<Building2 />} title="No employers yet" description="Add your employer to tag sessions, diary entries and sign-offs." />
      )}
    </div>
  );
}
