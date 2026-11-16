"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const CATS = [
  { key: "tools", name: "Tools", color: "var(--chart-1)" },
  { key: "ppe", name: "PPE", color: "var(--chart-2)" },
  { key: "fuel", name: "Fuel", color: "var(--chart-3)" },
  { key: "training", name: "Training", color: "var(--chart-4)" },
  { key: "equipment", name: "Equipment", color: "var(--chart-5)" },
  { key: "other", name: "Other", color: "var(--muted-foreground)" },
] as const;

export type SpendDatum = { label: string } & Partial<Record<(typeof CATS)[number]["key"], number>>;

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export function SpendChart({ data, height = 220 }: { data: SpendDatum[]; height?: number }) {
  const used = CATS.filter((c) => data.some((d) => (d[c.key] ?? 0) > 0));
  const series = used.length ? used : [CATS[0]];
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v) => aud.format(v)} width={56} />
            <Tooltip
              cursor={{ fill: "var(--muted)", radius: 6 }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
              formatter={(v) => aud.format(Number(v))}
            />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} stackId="s" fill={s.color} radius={i === series.length - 1 ? [6, 6, 2, 2] : [0, 0, 0, 0]} maxBarSize={32} animationDuration={350} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {used.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-muted-foreground">
          {used.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
