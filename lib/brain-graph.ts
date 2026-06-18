// Pure data-shaping for the Dashboard Brain division drill-down graph.
// No rendering/canvas/React here on purpose — DivisionGraphBrain.tsx owns
// presentation, this file only decides what nodes and links exist.

import {
  BrainEntityKind,
  DashboardStatus,
  DashboardWithUrgency,
  ReportSubscriptionWithUrgency,
  RequestWithCreator,
} from './brain-types';

export type GraphNodeKind = 'center' | BrainEntityKind | 'request';

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
  stakeholder?: string | null;
  lastTouchedDate?: string;
  openRequestCount?: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export const CENTER_NODE_ID = 'center';

const TYPE_COLORS: Record<BrainEntityKind, string> = {
  dashboard: '#22c55e', // green-500
  subscription: '#a855f7', // purple-500
};

const STATUS_RING_COLORS: Record<DashboardStatus, string> = {
  active: '#22c55e',
  maintenance: '#f59e0b',
  retired: '#64748b',
};

const REQUEST_NODE_COLOR = '#94a3b8'; // slate-400
const CENTER_NODE_COLOR = '#3b82f6';
const REQUEST_NODE_VAL = 2;

type EntityWithUrgency = DashboardWithUrgency | ReportSubscriptionWithUrgency;

function entityNodeId(kind: BrainEntityKind, id: number): string {
  return `${kind}-${id}`;
}

function requestNodeId(requestId: number): string {
  return `request-${requestId}`;
}

/**
 * Builds the full node/link graph for a division's detail view: a center
 * "you" node, one node per dashboard/subscription (colored by type, ringed
 * by status), and one node per open (non-"done") request, linked to its
 * parent entity. `requestsByEntity` is keyed by `${kind}-${id}` (see
 * `entityNodeId`), matching how DivisionGraphBrain fetches per-entity.
 */
export function buildGraphData(
  dashboards: DashboardWithUrgency[],
  subscriptions: ReportSubscriptionWithUrgency[],
  requestsByEntity: Map<string, RequestWithCreator[]>
): GraphData {
  const nodes: GraphNode[] = [
    {
      id: CENTER_NODE_ID,
      kind: 'center',
      label: 'You',
      val: 6,
      color: CENTER_NODE_COLOR,
    },
  ];
  const links: GraphLink[] = [];

  const addEntity = (kind: BrainEntityKind, entity: EntityWithUrgency) => {
    const nodeId = entityNodeId(kind, entity.id);

    nodes.push({
      id: nodeId,
      kind,
      label: entity.name,
      val: Math.max(4, Math.min(14, 2 + entity.openRequestCount)),
      color: TYPE_COLORS[kind],
      ringColor: STATUS_RING_COLORS[entity.status],
      entityKind: kind,
      entityId: entity.id,
      stakeholder: entity.stakeholder,
      lastTouchedDate: entity.lastTouchedDate,
      openRequestCount: entity.openRequestCount,
    });
    links.push({ source: CENTER_NODE_ID, target: nodeId });

    const requests = requestsByEntity.get(nodeId) ?? [];
    for (const request of requests) {
      if (request.status === 'done') continue; // only open/in_progress are "open"

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
      links.push({ source: nodeId, target: reqNodeId });
    }
  };

  dashboards.forEach((d) => addEntity('dashboard', d));
  subscriptions.forEach((s) => addEntity('subscription', s));

  return { nodes, links };
}
