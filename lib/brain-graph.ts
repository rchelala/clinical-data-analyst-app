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
} from './brain-types';
import { ANALYST_COLOR, VIEWER_RING_COLOR } from './brain-colors';

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
  // Present only on request->entity tethers. Left unset on entity->center
  // links, which have no request state to show, for clarity/debuggability —
  // rendering itself only branches on the value ("done"/"in_progress"), not
  // on whether this field is present.
  requestStatus?: RequestStatus;
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
const REQUEST_NODE_VAL = 2;
const CENTER_NODE_VAL = 6;
const VIEWER_CENTER_NODE_VAL = 7; // subtle bump, mirroring SolarSystemView's VIEWER_CENTER_RADIUS vs CENTER_RADIUS

type EntityWithUrgency = DashboardWithUrgency | ReportSubscriptionWithUrgency;

function entityNodeId(kind: BrainEntityKind, id: number): string {
  return `${kind}-${id}`;
}

function requestNodeId(requestId: number): string {
  return `request-${requestId}`;
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
 * matching how DivisionGraphBrain fetches per-entity.
 *
 * `centerLabel` is the viewed analyst's name; `isViewerCenter` is true only
 * when the viewed analyst IS the viewer, mirroring SolarSystemView's
 * isViewerCenter treatment (distinct ring color + slightly larger radius).
 */
export function buildGraphData(
  dashboards: DashboardWithUrgency[],
  subscriptions: ReportSubscriptionWithUrgency[],
  requestsByEntity: Map<string, RequestWithCreator[]>,
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

  const addEntity = (kind: BrainEntityKind, entity: EntityWithUrgency) => {
    const nodeId = entityNodeId(kind, entity.id);
    const isMaintenance = entity.status === 'maintenance';

    nodes.push({
      id: nodeId,
      kind,
      label: entity.name,
      val: Math.max(4, Math.min(14, 2 + entity.openRequestCount)),
      color: isMaintenance ? 'transparent' : STATUS_RING_COLORS[entity.status],
      ringColor: isMaintenance ? STATUS_RING_COLORS[entity.status] : undefined,
      entityKind: kind,
      entityId: entity.id,
      stakeholder: entity.stakeholder,
      lastTouchedDate: entity.lastTouchedDate,
      openRequestCount: entity.openRequestCount,
    });
    links.push({ source: CENTER_NODE_ID, target: nodeId });

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
  };

  dashboards.forEach((d) => addEntity('dashboard', d));
  subscriptions.forEach((s) => addEntity('subscription', s));

  return { nodes, links };
}
