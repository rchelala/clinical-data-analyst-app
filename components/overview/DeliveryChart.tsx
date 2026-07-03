// Hand-rolled SVG grouped bar chart for the Division Overview page's
// "what we've delivered" section — no chart library, just inline SVG
// styled with the Eclipse brand palette. Renders exactly 6 months of
// requests/tasks-completed counts (throughput is always length 6, see
// lib/brain-types.ts OverviewResponse).

import { OverviewThroughputPoint } from "@/lib/brain-types";

interface DeliveryChartProps {
  data: OverviewThroughputPoint[];
}

const REQUESTS_COLOR = "#3a5fff"; // brand-500
const TASKS_COLOR = "#34d399"; // emerald-400, matches the app's existing "success" accent

const CHART_HEIGHT = 160;
const BAR_GROUP_GAP = 28;
const BAR_GAP = 4;
const BAR_WIDTH = 16;

function formatMonthLabel(month: string): string {
  // 'YYYY-MM' -> short month label, e.g. "Jul"
  const [year, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, (m ?? 1) - 1, 1));
  return d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

export function DeliveryChart({ data }: DeliveryChartProps) {
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.requests, d.tasks)));
  const allZero = data.every((d) => d.requests === 0 && d.tasks === 0);

  const groupWidth = BAR_WIDTH * 2 + BAR_GAP;
  const width = data.length * groupWidth + (data.length - 1) * BAR_GROUP_GAP + BAR_GROUP_GAP;

  return (
    <div className="rounded-lg border border-theme bg-panel px-5 py-4 shadow-panel">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-primary">
            What we&apos;ve delivered — requests &amp; tasks completed per month
          </h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-secondary flex-shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: REQUESTS_COLOR }} />
            Requests
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: TASKS_COLOR }} />
            Tasks
          </span>
        </div>
      </div>

      {allZero ? (
        <div className="flex items-center justify-center h-32 text-xs text-secondary">
          No requests or tasks completed in the last 6 months.
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
            width="100%"
            height={CHART_HEIGHT}
            preserveAspectRatio="xMinYMid meet"
            role="img"
            aria-label="Bar chart of requests and tasks completed per month over the last 6 months"
          >
            {/* Baseline */}
            <line x1={0} y1={CHART_HEIGHT - 24} x2={width} y2={CHART_HEIGHT - 24} stroke="var(--border)" strokeWidth={1} />

            {data.map((point, i) => {
              const groupX = BAR_GROUP_GAP / 2 + i * (groupWidth + BAR_GROUP_GAP);
              const plotHeight = CHART_HEIGHT - 24 - 14; // leave room for baseline + labels above bars
              const reqHeight = (point.requests / maxValue) * plotHeight;
              const taskHeight = (point.tasks / maxValue) * plotHeight;
              const baseY = CHART_HEIGHT - 24;

              return (
                <g key={point.month}>
                  {/* Requests bar */}
                  <rect
                    x={groupX}
                    y={baseY - reqHeight}
                    width={BAR_WIDTH}
                    height={reqHeight}
                    rx={2}
                    fill={REQUESTS_COLOR}
                  />
                  {point.requests > 0 && (
                    <text
                      x={groupX + BAR_WIDTH / 2}
                      y={baseY - reqHeight - 4}
                      textAnchor="middle"
                      fontSize={9}
                      fill="var(--text-secondary)"
                    >
                      {point.requests}
                    </text>
                  )}

                  {/* Tasks bar */}
                  <rect
                    x={groupX + BAR_WIDTH + BAR_GAP}
                    y={baseY - taskHeight}
                    width={BAR_WIDTH}
                    height={taskHeight}
                    rx={2}
                    fill={TASKS_COLOR}
                  />
                  {point.tasks > 0 && (
                    <text
                      x={groupX + BAR_WIDTH + BAR_GAP + BAR_WIDTH / 2}
                      y={baseY - taskHeight - 4}
                      textAnchor="middle"
                      fontSize={9}
                      fill="var(--text-secondary)"
                    >
                      {point.tasks}
                    </text>
                  )}

                  {/* Month label */}
                  <text
                    x={groupX + BAR_WIDTH + BAR_GAP / 2}
                    y={CHART_HEIGHT - 8}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--text-secondary)"
                  >
                    {formatMonthLabel(point.month)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
