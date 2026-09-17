"use client";

// Thin wrapper around DivisionGraphBrain, matching the GalaxyView /
// SolarSystemView naming convention for the three zoom-level view
// components. No added logic — see GALAXY_VIEW_SPEC.md section 3, "Planet
// zoom (innermost — existing view)": keep the existing screen as-is.

import { DivisionGraphBrain } from "@/components/brain/DivisionGraphBrain";
import {
  Division,
  DashboardWithUrgency,
  ReportSubscriptionWithUrgency,
  BrainEntityKind,
} from "@/lib/brain-types";
import { BrainFilters } from "@/lib/filters";

interface PlanetViewProps {
  division: Division;
  dashboards: DashboardWithUrgency[];
  subscriptions: ReportSubscriptionWithUrgency[];
  filters: BrainFilters;
  centerLabel: string;
  isViewerCenter: boolean;
  onSelectEntity: (kind: BrainEntityKind, id: number, focusRequestId?: number) => void;
  onAddEntity?: () => void;
  viewedAnalystId: number;
  onJumpToAnalyst: (analystId: number) => void;
  // Bumped by the page to ask DivisionGraphBrain to refetch just its two
  // batch calls (requests + tasks) in place, without unmounting — see
  // app/brain/page.tsx's graphRefreshKey.
  refreshKey?: number;
}

export function PlanetView(props: PlanetViewProps) {
  return <DivisionGraphBrain {...props} />;
}
