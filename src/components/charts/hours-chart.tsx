"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface HoursDatum {
  label: string;
  ordinary: number;
  overtime: number;
  weekend: number;
  holiday: number;
}

const SERIES = [
  { key: "ordinary", name: "Ordinary", color: "var(--chart-1)" },
  { key: "overtime", name: "Overtime", color: "var(--chart-3)" },
  { key: "weekend", name: "Weekend", color: "var(--chart-2)" },
  { key: "holiday", name: "Public holiday", color: "var(--chart-4)" },
] as const;

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-[12px] shadow-pop">
      <div className="mb-1 font-medium">{label}</div>
      {payload
        .filter((p) => p.value > 0)
        .map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4 text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: p.color }} /> {p.name}
            </span>
            <span className="tabular text-foreground">{p.value.toFixed(2)}h</span>
          </div>
        ))}
      <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
        <span>Total</span>
        <span className="tabular">{total.toFixed(2)}h</span>
      </div>
    </div>
  );
}

export function HoursChart({ data, height = 200 }: { data: HoursDatum[]; height?: number }) {
  const used = SERIES.filter((s) => data.some((d) => d[s.key] > 0));
  const series = used.length ? used : [SERIES[0]];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} allowDecimals={false} />
          <Tooltip cursor={{ fill: "var(--muted)", radius: 6 }} content={<TooltipBox />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="h"
              fill={s.color}
              radius={i === series.length - 1 ? [6, 6, 2, 2] : [0, 0, 0, 0]}
              maxBarSize={36}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ data }: { data: HoursDatum[] }) {
  const used = SERIES.filter((s) => data.some((d) => d[s.key] > 0));
  if (used.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-3 text-[11.5px] text-muted-foreground">
      {used.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.name}
        </span>
      ))}
    </div>
  );
}
