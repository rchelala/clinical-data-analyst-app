export type WorklistItemKind = "dashboard" | "subscription";

// Unified view-model for a row in the "My Dashboards / Report Subscriptions"
// section. Dashboards and report subscriptions share the same worklist columns
// (priority, worklistStatus, comments, notes, summary, enterpriseAnalyst), so
// they render through one shape, discriminated by `kind` for routing PATCH and
// task-fetch calls to the right endpoint.
export interface WorklistItem {
  kind: WorklistItemKind;
  id: number;
  name: string;
  priority: string | null;
  worklistStatus: string | null;
  enterpriseAnalyst: string | null;
  comments: string | null;
  notes: string | null;
  summary: string | null;
  ownerName: string | null;
  isCovering: boolean;
  activeTaskCount: number;
  totalTaskCount: number;
}
