import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { EfferdShell } from "@/components/EfferdShell";
import { fetchAnalyticsDashboard } from "@/lib/sales/queries";
import type { AnalyticsRange } from "@/lib/sales/types";

function parseRange(value: string | string[] | undefined): AnalyticsRange {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "day" || v === "week" || v === "month" || v === "year") return v;
  return "week";
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range = parseRange(params.range);
  const data = await fetchAnalyticsDashboard(range);

  return (
    <EfferdShell focus>
      <AnalyticsDashboard range={range} data={data} />
    </EfferdShell>
  );
}
