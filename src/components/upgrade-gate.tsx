import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { PLANS } from "@/lib/plans";

/** Shown in place of a Pro-only section for Free users. Explains, never fakes the feature. */
export function UpgradeGate({ title, description, points }: { title: string; description: string; points: string[] }) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <div className="mx-auto max-w-lg rounded-3xl border border-primary/25 bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Sparkles className="size-5" />
        </div>
        <h2 className="text-lg font-semibold">{title} is part of Pro</h2>
        <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left text-[14px]">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {p}
            </li>
          ))}
        </ul>
        <Button asChild size="lg" className="mt-7 w-full">
          <Link href="/settings/plan">See Pro · ${PLANS.pro.priceMonthlyAud.toFixed(2)}/month</Link>
        </Button>
      </div>
    </div>
  );
}
