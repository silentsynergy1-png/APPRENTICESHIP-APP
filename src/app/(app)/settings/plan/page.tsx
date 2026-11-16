import type { Metadata } from "next";
import { Check, Sparkles } from "lucide-react";
import { requireAppContext } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/misc";
import { PLANS, paymentsEnabled } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { UpgradeButton } from "./upgrade-button";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage() {
  const ctx = await requireAppContext();
  const current = ctx.entitlements.tier;
  const canPay = paymentsEnabled();

  return (
    <div className="grid gap-5">
      {ctx.entitlements.betaOverride ? (
        <Alert tone="primary" icon={<Sparkles />} title="Beta access">
          Every Pro feature is unlocked during the beta, free of charge.
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {(["free", "pro"] as const).map((tier) => {
          const p = PLANS[tier];
          const isCurrent = current === tier;
          return (
            <Card key={tier} className={cn(tier === "pro" && "border-primary/40")}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  {isCurrent ? <Badge tone="success">Current plan</Badge> : null}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight">${p.priceMonthlyAud.toFixed(2)}</span>
                  <span className="text-[13px] text-muted-foreground">AUD / month</span>
                </div>
                <ul className="mt-5 space-y-2 text-[14px]">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {h}
                    </li>
                  ))}
                </ul>
                {tier === "pro" && !isCurrent ? (
                  <div className="mt-6">
                    {canPay ? (
                      <UpgradeButton />
                    ) : (
                      <p className="rounded-xl bg-subtle p-3 text-[13px] text-muted-foreground">
                        Pro subscriptions open soon. Payments aren&apos;t live yet while we finish testing, so nothing can be charged.
                      </p>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
