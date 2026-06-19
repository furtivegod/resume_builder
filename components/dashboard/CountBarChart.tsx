import type { CountEntry } from "@/lib/dashboard-stats";
import { providerColor, providerLabel } from "@/lib/dashboard-stats";

interface CountBarChartProps {
  title: string;
  subtitle?: string;
  entries: CountEntry[];
  emptyMessage?: string;
  colorByProvider?: boolean;
  maxItems?: number;
  compact?: boolean;
}

export default function CountBarChart({
  title,
  subtitle,
  entries,
  emptyMessage = "No data for this period.",
  colorByProvider = false,
  maxItems = 8,
  compact = false,
}: CountBarChartProps) {
  const visible = entries.slice(0, maxItems);
  const maxCount = visible[0]?.count ?? 0;

  return (
    <div className={compact ? "chart-panel-compact h-full" : "chart-panel h-full"}>
      <div className={compact ? "mb-2" : "mb-4"}>
        <h3 className={`section-title ${compact ? "text-sm" : "text-base"}`}>{title}</h3>
        {subtitle && !compact && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>

      {visible.length === 0 ? (
        <p
          className={`rounded-lg border border-dashed border-slate-200 bg-slate-50/80 text-center text-slate-500 ${
            compact ? "px-3 py-6 text-xs" : "px-4 py-10 text-sm"
          }`}
        >
          {emptyMessage}
        </p>
      ) : (
        <div className={compact ? "space-y-1.5" : "space-y-3"}>
          {visible.map((entry) => {
            const width = maxCount > 0 ? Math.max(6, (entry.count / maxCount) * 100) : 0;
            const colors = colorByProvider ? providerColor(entry.label) : null;
            const label = colorByProvider ? providerLabel(entry.label) : entry.label;

            return (
              <div key={entry.label}>
                <div
                  className={`mb-0.5 flex items-center justify-between gap-2 ${
                    compact ? "text-xs" : "text-sm"
                  }`}
                >
                  <span
                    className={`min-w-0 truncate font-medium ${
                      colors ? colors.text : "text-slate-700"
                    }`}
                    title={label}
                  >
                    {label}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                    {entry.count}
                  </span>
                </div>
                <div className="chart-bar-track">
                  <div
                    className={`chart-bar-fill ${colors ? colors.bar : "bg-gradient-to-r from-blue-500 to-cyan-500"}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
