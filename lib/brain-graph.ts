// Pure data-shaping for the Dashboard Brain division drill-down graph.
// No rendering/canvas/React here on purpose — DivisionGraphBrain.tsx owns
// presentation, this file only decides what nodes and links exist.

import {
  BrainEntityKind,
  DashboardStatus,
  DashboardWithUrgency,
  ReportSubscriptionWithUrgency,
  RequestStatus,
  RequestWithCreator,
  Task,
} from './brain-types';
import { ANALYST_COLOR, VIEWER_RING_COLOR } from './brain-colors';

export type GraphNodeKind = 'center' | BrainEntityKind | 'request' | 'task';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  val: number; // drives rendered node radius
  color: string; // fill color
  ringColor?: string; // border color (status), entity nodes only
  // For 'dashboard' | 'subscription' nodes: entityKind === kind, entityId === own id.
  // For 'request' nodes: entityKind/entityId identify the PARENT entity, requestId identifies the request itself.
  entityKind?: BrainEntityKind;
  entityId?: number;
  requestId?: number;
  taskId?: number;
  stakeholder?: string | null;
  lastTouchedDate?: string;
  openRequestCount?: number;
  inProgressRequestCount?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  // Present only on request->entity tethers. Left unset on entity->center
  // links, which have no request state to show, for clarity/debuggability —
  // rendering itself only branches on the value ("done"/"in_progress"), not
  // on whether this field is present.
  requestStatus?: RequestStatus;
  // Present only on subscription->dashboard tethers for a linked entity
  // (subscription.linkedDashboardId). Marks this link as needing the
  // visually distinct "linked entity" treatment rather than the
  // request-status-colored treatment. Never set alongside requestStatus —
  // each link is either a request tether, a linked-entity tether, or a
  // plain entity->center tether.
  linkedEntity?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export const CENTER_NODE_ID = 'center';

const STATUS_RING_COLORS: Record<DashboardStatus, string> = {
  active: '#22c55e',
  maintenance: '#f59e0b',
  retired: '#64748b',
};

const REQUEST_NODE_COLOR = '#94a3b8'; // slate-400
const TASK_NODE_COLOR = '#2dd4bf'; // teal-400, distinct from request slate
const NO_FILL = 'transparent'; // sentinel: maintenance-status entities render ring-only, no fill
const REQUEST_NODE_VAL = 2;
const TASK_NODE_VAL = 2;
const CENTER_NODE_VAL = 6;
const VIEWER_CENTER_NODE_VAL = 7; // subtle bump, mirroring SolarSystemView's VIEWER_CENTER_RADIUS vs CENTER_RADIUS

type EntityWithUrgency = DashboardWithUrgency | ReportSubscriptionWithUrgency;

function entityNodeId(kind: BrainEntityKind, id: number): string {
  return `${kind}-${id}`;
}

function requestNodeId(requestId: number): string {
  return `request-${requestId}`;
}

function taskNodeId(taskId: number): string {
  return `task-${taskId}`;
}

/**
 * Coerces a free-form task status string into the RequestStatus union so the
 * existing request-tether dash/fade styling (open/in_progress/done) applies
 * unchanged to task->entity links, without task statuses needing to match
 * the request status enum exactly.
 */
function taskStatusToRequestStatus(status: string): RequestStatus {
  if (status === 'done') return 'done';
  if (status === 'in_progress') return 'in_progress';
  return 'open';
}

/**
 * Builds the full node/link graph for a division's detail view: a center
 * node for the VIEWED analyst, one node per dashboard/subscription (colored
 * solely by status — fill for active/retired, transparent fill + ring for
 * maintenance, mirroring DashboardMoon.tsx's convention exactly, no
 * type-based coloring), and one node per request (open, in-progress, or
 * done), linked to its parent entity. Closed ("done") requests are kept —
 * not filtered — so the rendering layer can show them as faded tethers per
 * the Galaxy View spec, rather than dropping them from the graph entirely.
 * `requestsByEntity` is keyed by `${kind}-${id}` (see `entityNodeId`),
 * matching how DivisionGraphBrain fetches per-entity. `tasksByEntity` follows
 * the same `${kind}-${id}` keying for dashboard/subscription tasks, plus the
 * literal key `'center'` for division-standalone tasks (tasks with
 * `divisionId` set and no dashboard/subscription parent), which are linked
 * directly to the center node since they have no entity parent.
 *
 * A subscription whose `linkedDashboardId` resolves to a real dashboard in
 * this division skips its own center tether entirely — it connects to the
 * graph solely through its dashboard (the `linkedEntity` tether below),
 * mirroring how a request has no direct center tether either. A subscription
 * with no link, or a stale/cross-division link, keeps the normal center
 * tether so it's never left disconnected from the graph.
 *
 * `centerLabel` is the viewed analyst's name; `isViewerCenter` is true only
 * when the viewed analyst IS the viewer, mirroring SolarSystemView's
 * isViewerCenter treatment (distinct ring color + slightly larger radius).
 */
export function buildGraphData(
  dashboards: DashboardWithUrgency[],
  subscriptions: ReportSubscriptionWithUrgency[],
  requestsByEntity: Map<string, RequestWithCreator[]>,
  tasksByEntity: Map<string, Task[]>,
  centerLabel: string,
  isViewerCenter: boolean
): GraphData {
  const nodes: GraphNode[] = [
    {
      id: CENTER_NODE_ID,
      kind: 'center',
      label: isViewerCenter ? `${centerLabel} (You)` : centerLabel,
      val: isViewerCenter ? VIEWER_CENTER_NODE_VAL : CENTER_NODE_VAL,
      color: ANALYST_COLOR,
      ringColor: isViewerCenter ? VIEWER_RING_COLOR : undefined,
    },
  ];
  const links: GraphLink[] = [];

  // Computed up front (not just in the linked-entity pass below) because
  // addEntity also needs it to decide whether a linked subscription should
  // skip its center tether — both decisions must agree, or a subscription
  // with a stale/cross-division link would end up with neither tether.
  const dashboardIds = new Set(dashboards.map((d) => d.id));

  const addEntity = (kind: BrainEntityKind, entity: EntityWithUrgency, skipCenterTether: boolean) => {
    const nodeId = entityNodeId(kind, entity.id);
    const isMaintenance = entity.status === 'maintenance';

    nodes.push({
      id: nodeId,
      kind,
      label: entity.name,
      val: Math.max(4, Math.min(14, 2 + entity.openRequestCount)),
      color: isMaintenance ? NO_FILL : STATUS_RING_COLORS[entity.status],
      ringColor: isMaintenance ? STATUS_RING_COLORS[entity.status] : undefined,
      entityKind: kind,
      entityId: entity.id,
      stakeholder: entity.stakeholder,
      lastTouchedDate: entity.lastTouchedDate,
      openRequestCount: entity.openRequestCount,
      inProgressRequestCount: entity.inProgressRequestCount,
    });
    if (!skipCenterTether) {
      links.push({ source: CENTER_NODE_ID, target: nodeId });
    }

    const requests = requestsByEntity.get(nodeId) ?? [];
    for (const request of requests) {
      const reqNodeId = requestNodeId(request.id);
      nodes.push({
        id: reqNodeId,
        kind: 'request',
        label: request.title,
        val: REQUEST_NODE_VAL,
        color: REQUEST_NODE_COLOR,
        entityKind: kind,
        entityId: entity.id,
        requestId: request.id,
      });
      links.push({ source: nodeId, target: reqNodeId, requestStatus: request.status });
    }

    const tasks = tasksByEntity.get(nodeId) ?? [];
    for (const task of tasks) {
      const taskNode = taskNodeId(task.id);
      nodes.push({
        id: taskNode,
        kind: 'task',
        label: task.title,
        val: TASK_NODE_VAL,
        color: TASK_NODE_COLOR,
        entityKind: kind,
        entityId: entity.id,
        taskId: task.id,
      });
      links.push({ source: nodeId, target: taskNode, requestStatus: taskStatusToRequestStatus(task.status) });
    }
  };

  // A subscription's link only counts if it actually resolves to a
  // dashboard present in this division — used below both to decide whether
  // to skip the subscription's center tether and whether to draw the
  // linked-entity tether, so the two decisions can't drift apart.
  const hasValidDashboardLink = (s: ReportSubscriptionWithUrgency) =>
    s.linkedDashboardId !== null && dashboardIds.has(s.linkedDashboardId);

  dashboards.forEach((d) => addEntity('dashboard', d, false));
  subscriptions.forEach((s) => addEntity('subscription', s, hasValidDashboardLink(s)));

  // Linked-entity tether: a subscription may optionally link to one
  // dashboard in the same division (subscription.linkedDashboardId). The
  // API enforces same-division linking at the moment a link is created or
  // edited, but that's a write-time check, not an invariant: a dashboard's
  // own division can still be changed afterward (PATCH /api/dashboards/[id]
  // has no guard against this), which would leave any subscription that
  // links to it pointing cross-division. hasValidDashboardLink catches that
  // case and skips the edge rather than creating a dangling link to a node
  // that doesn't exist in this graph — logged so a real desync doesn't
  // disappear silently.
  subscriptions.forEach((s) => {
    if (s.linkedDashboardId === null) return;
    if (hasValidDashboardLink(s)) {
      links.push({
        source: entityNodeId('subscription', s.id),
        target: entityNodeId('dashboard', s.linkedDashboardId),
        linkedEntity: true,
      });
    } else {
      console.warn(
        `Subscription ${s.id} links to dashboard ${s.linkedDashboardId}, which is not in this division — skipping tether.`
      );
    }
  });

  const standaloneTasks = tasksByEntity.get(CENTER_NODE_ID) ?? [];
  for (const task of standaloneTasks) {
    const taskNode = taskNodeId(task.id);
    nodes.push({
      id: taskNode,
      kind: 'task',
      label: task.title,
      val: TASK_NODE_VAL,
      color: TASK_NODE_COLOR,
      taskId: task.id,
    });
    links.push({ source: CENTER_NODE_ID, target: taskNode, requestStatus: taskStatusToRequestStatus(task.status) });
  }

  return { nodes, links };
}
