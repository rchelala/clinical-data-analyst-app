"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { computePositionInWedge, computeRequestMoonPositions, Wedge } from "@/lib/layout-math";
import {
  Division,
  DashboardWithUrgency,
  ReportSubscriptionWithUrgency,
  DashboardStatus,
  BrainEntityKind,
} from "@/lib/brain-types";

interface DivisionDetailBrainProps {
  division: Division;
  dashboards: DashboardWithUrgency[]; // already filtered by caller to just this division
  subscriptions: ReportSubscriptionWithUrgency[]; // already filtered by caller to just this division
  onSelectEntity: (kind: BrainEntityKind, id: number) => void;
  onBack: () => void;
}

interface EntityRef {
  kind: BrainEntityKind;
  id: number;
}

type DetailEntity = DashboardWithUrgency | ReportSubscriptionWithUrgency;

interface PositionedEntity {
  kind: BrainEntityKind;
  entity: DetailEntity;
  x: number;
  y: number;
}

const STATUS_COLORS: Record<DashboardStatus, string> = {
  active: "#22c55e", // green-500
  maintenance: "#f59e0b", // amber-500
  retired: "#64748b", // slate-500
};

const MOON_COLLAPSE_THRESHOLD = 8;
const VIEWBOX_HALF = 450;

// Two literal half-circle wedges: dashboards on the left half, subscriptions
// on the right half (in the 12-o'clock/clockwise angle convention used by
// computePositionInWedge, 0-180 spans the right side and 180-360 the left —
// see layout-math.ts for the exact convention).
const DASHBOARD_WEDGE: Wedge = { startAngle: 0, endAngle: 180 };
const SUBSCRIPTION_WEDGE: Wedge = { startAngle: 180, endAngle: 360 };

function daysSince(dateString: string): number {
  return Math.floor((Date.now() - new Date(dateString).getTime()) / 86400000);
}

function refsEqual(a: EntityRef | null, b: EntityRef): boolean {
  return !!a && a.kind === b.kind && a.id === b.id;
}

export function DivisionDetailBrain({
  division,
  dashboards,
  subscriptions,
  onSelectEntity,
  onBack,
}: DivisionDetailBrainProps) {
  const [hovered, setHovered] = useState<EntityRef | null>(null);

  const positioned = useMemo<PositionedEntity[]>(() => {
    const result: PositionedEntity[] = [];

    dashboards.forEach((dashboard, i) => {
      const { x, y } = computePositionInWedge(
        dashboard.radius,
        DASHBOARD_WEDGE,
        i,
        dashboards.length
      );
      result.push({ kind: "dashboard", entity: dashboard, x, y });
    });

    subscriptions.forEach((subscription, i) => {
      const { x, y } = computePositionInWedge(
        subscription.radius,
        SUBSCRIPTION_WEDGE,
        i,
        subscriptions.length
      );
      result.push({ kind: "subscription", entity: subscription, x, y });
    });

    return result;
  }, [dashboards, subscriptions]);

  const hoveredEntity = positioned.find((p) => refsEqual(hovered, { kind: p.kind, id: p.entity.id })) ?? null;

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex items-center gap-3 px-6 py-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel text-secondary hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          All divisions
        </button>
        <h2 className="text-sm font-semibold text-primary">{division.name}</h2>
      </div>

      <div className="relative flex-1 flex items-center justify-center">
        <svg
          viewBox={`-${VIEWBOX_HALF} -${VIEWBOX_HALF} ${VIEWBOX_HALF * 2} ${VIEWBOX_HALF * 2}`}
          className="w-full h-full max-w-[900px] max-h-[900px]"
        >
          {/* Dividing line between the dashboards half (right) and the
              subscriptions half (left), at the 0/180 boundary. */}
          <line
            x1={0}
            y1={-VIEWBOX_HALF}
            x2={0}
            y2={VIEWBOX_HALF}
            stroke="currentColor"
            className="text-slate-400 dark:text-slate-600"
            strokeOpacity={0.25}
            strokeWidth={1}
          />

          {/* Half labels. */}
          <text
            x={VIEWBOX_HALF * 0.5}
            y={-VIEWBOX_HALF + 24}
            textAnchor="middle"
            fontSize={13}
            fontWeight={600}
            fill="currentColor"
            className="text-secondary"
          >
            Dashboards
          </text>
          <text
            x={-VIEWBOX_HALF * 0.5}
            y={-VIEWBOX_HALF + 24}
            textAnchor="middle"
            fontSize={13}
            fontWeight={600}
            fill="currentColor"
            className="text-secondary"
          >
            Subscriptions
          </text>

          {/* Center marker — the viewing analyst. */}
          <circle cx={0} cy={0} r={10} fill="#3b82f6" stroke="white" strokeWidth={2} />

          {/* Entities, each with its moon dots / collapsed badge. */}
          {positioned.map(({ kind, entity, x, y }) => {
            const radius = Math.max(8, Math.min(20, 4 + entity.openRequestCount));
            const color = STATUS_COLORS[entity.status] ?? STATUS_COLORS.active;
            const ref: EntityRef = { kind, id: entity.id };
            const isHovered = refsEqual(hovered, ref);
            const showMoons =
              entity.openRequestCount > 0 && entity.openRequestCount <= MOON_COLLAPSE_THRESHOLD;
            const showBadge = entity.openRequestCount > MOON_COLLAPSE_THRESHOLD;

            const moonPositions = showMoons
              ? computeRequestMoonPositions(x, y, entity.openRequestCount, radius + 10)
              : [];

            return (
              <g key={`${kind}-${entity.id}`}>
                {showMoons &&
                  moonPositions.map((moon, i) => (
                    <circle
                      key={i}
                      cx={moon.x}
                      cy={moon.y}
                      r={3}
                      fill="#94a3b8"
                      opacity={0.85}
                    />
                  ))}

                {showBadge && (
                  <g transform={`translate(${x + radius + 8}, ${y - radius - 8})`}>
                    <circle r={9} fill="#ef4444" />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={700}
                      fill="white"
                    >
                      {entity.openRequestCount}
                    </text>
                  </g>
                )}

                <circle
                  cx={x}
                  cy={y}
                  r={radius}
                  fill={color}
                  stroke={isHovered ? "white" : "rgba(255,255,255,0.4)"}
                  strokeWidth={isHovered ? 2 : 1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(ref)}
                  onMouseLeave={() => setHovered((h) => (refsEqual(h, ref) ? null : h))}
                  onClick={() => {
                    setHovered((h) => (refsEqual(h, ref) ? null : ref));
                    onSelectEntity(kind, entity.id);
                  }}
                />
              </g>
            );
          })}
        </svg>

        {hoveredEntity && (
          <div className="absolute top-4 left-4 max-w-xs rounded-lg border border-theme bg-panel shadow-lg px-4 py-3 pointer-events-none">
            <p className="text-sm font-semibold text-primary">{hoveredEntity.entity.name}</p>
            <p className="text-xs text-secondary mt-1">
              Stakeholder: {hoveredEntity.entity.stakeholder ?? "—"}
            </p>
            <p className="text-xs text-secondary">
              Last touched: {daysSince(hoveredEntity.entity.lastTouchedDate)} days ago
            </p>
            <p className="text-xs text-secondary">
              Open requests: {hoveredEntity.entity.openRequestCount}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
