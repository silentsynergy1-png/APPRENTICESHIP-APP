"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Switch } from "@/components/ui/overlay";
import { useActionCall } from "@/components/action-form";
import { DASHBOARD_CARDS } from "@/lib/constants";
import type { DashboardCard } from "@/lib/types";
import { saveDashboardCards } from "./actions";

export function CustomiseDashboard({ cards }: { cards: DashboardCard[] }) {
  const [open, setOpen] = useState(false);
  const all = DASHBOARD_CARDS.map((c) => c.value as DashboardCard);
  const [order, setOrder] = useState<DashboardCard[]>(() => [...cards, ...all.filter((c) => !cards.includes(c))]);
  const [enabled, setEnabled] = useState<Set<DashboardCard>>(() => new Set(cards));
  const { pending, run } = useActionCall();

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal /> Customise
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Customise dashboard" description="Choose which cards appear, and in what order.">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {order.map((c, i) => {
              const meta = DASHBOARD_CARDS.find((d) => d.value === c)!;
              const locked = c === "clock";
              return (
                <li key={c} className="flex items-center gap-3 px-3 py-2.5">
                  <Switch
                    checked={enabled.has(c)}
                    disabled={locked}
                    aria-label={`Show ${meta.label}`}
                    onCheckedChange={(v) => {
                      const next = new Set(enabled);
                      if (v) next.add(c);
                      else next.delete(c);
                      setEnabled(next);
                    }}
                  />
                  <span className="flex-1 text-[14px]">
                    {meta.label}
                    {locked ? <span className="ml-1.5 text-[11.5px] text-muted-foreground">always on</span> : null}
                  </span>
                  <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button
            className="mt-5 w-full"
            size="lg"
            disabled={pending}
            onClick={() =>
              run(() => saveDashboardCards(order.filter((c) => enabled.has(c))), { onSuccess: () => setOpen(false) })
            }
          >
            Save
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
