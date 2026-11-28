"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { bucketLabel, type StatsGrain, type StatsTrendPoint } from "@/lib/sales/stats";

const SERIES = [
  { key: "call", label: "Telefon", color: "var(--tone-blue-fg)" },
  { key: "email", label: "E-Mail", color: "var(--tone-violet-fg)" },
  { key: "dm", label: "LinkedIn", color: "var(--tone-gray-fg)" },
  { key: "sonstige", label: "Sonstige", color: "var(--tone-yellow-fg)" },
] as const;

/** Kontakt-Touches je Kanal (gestapelt) + gebuchte Termine (Linie, eigene Achse). */
export function StatsTrendChart({ data, grain }: { data: StatsTrendPoint[]; grain: StatsGrain }) {
  const points = data.map((p) => ({ ...p, label: bucketLabel(p.b, grain) }));
  const used = SERIES.filter((s) => points.some((p) => p[s.key] > 0));
  const series = used.length ? used : SERIES.slice(0, 1);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--fg-subtle)" }} />
          <YAxis
            yAxisId="touches"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
          />
          <YAxis
            yAxisId="termine"
            orientation="right"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--accent)" }}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--fg)",
            }}
            labelStyle={{ color: "var(--fg)", fontWeight: 600 }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--fg-muted)" }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              yAxisId="touches"
              dataKey={s.key}
              name={s.label}
              stackId="t"
              fill={s.color}
              fillOpacity={0.75}
              radius={i === series.length - 1 ? [3, 3, 0, 0] : 0}
              maxBarSize={36}
            />
          ))}
          <Line
            yAxisId="termine"
            type="linear"
            dataKey="termine"
            name="Termine"
            stroke="var(--accent)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "var(--accent)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
