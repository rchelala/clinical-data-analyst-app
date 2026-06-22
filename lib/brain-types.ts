// Single source of truth for Dashboard Brain types.
// DB columns are snake_case (see scripts/schema.sql); these interfaces use
// camelCase. The API layer is responsible for mapping between the two.

export interface Analyst {
  id: number;
  name: string;
}

export type UrgencyBucket = 'high' | 'med' | 'low';

export interface AnalystSummary {
  id: number;
  name: string;
  divisionCount: number;
  dashboardCount: number;
  subscriptionCount: number;
  highUrgencyCount: number; // dashboards+subscriptions in the top urgency tercile, computed globally across ALL analysts, not just this one
}

export interface Division {
  id: number;
  name: string;
  sortOrder: number;
  createdByAnalystId: number | null;
}

export type DashboardStatus = 'active' | 'maintenance' | 'retired';

export interface Dashboard {
  id: number;
  name: string;
  divisionId: number;
  analystId: number | null;
  stakeholder: string | null;
  status: DashboardStatus;
  jiraTicketId: string | null;
  lastTouchedDate: string;
  createdDate: string;
}

export interface DashboardWithUrgency extends Dashboard {
  openRequestCount: number;
  inProgressRequestCount: number;
  urgency: number;
  radius: number;
}

export type BrainEntityKind = 'dashboard' | 'subscription';

export interface ReportSubscription {
  id: number;
  name: string;
  divisionId: number;
  analystId: number | null;
  stakeholder: string | null;
  status: DashboardStatus; // reuse the existing status union type, it's generic enough
  jiraTicketId: string | null;
  lastTouchedDate: string;
  createdDate: string;
}

export interface ReportSubscriptionWithUrgency extends ReportSubscription {
  openRequestCount: number;
  inProgressRequestCount: number;
  urgency: number;
  radius: number;
}

export type RequestType = 'feature' | 'bug' | 'field_request';
export type RequestStatus = 'open' | 'in_progress' | 'done';

export interface Tag {
  id: number;
  name: string;
}

export interface RelatedRequestSummary {
  id: number;
  title: string;
  status: RequestStatus;
  dashboardId: number | null;
  subscriptionId: number | null;
  contextName?: string; // parent dashboard/subscription name, for picker display
}

export interface Request {
  id: number;
  dashboardId: number | null;
  subscriptionId: number | null;
  createdById: number;
  title: string;
  description: string | null;
  requestType: RequestType;
  status: RequestStatus;
  jiraTicketId: string | null;
  createdDate: string;
  completedDate: string | null;
  attachmentUrl: string | null;
  attachmentFilename: string | null;
  tags: Tag[];
  relatedRequests: RelatedRequestSummary[];
}

export interface RequestWithCreator extends Request {
  createdByName: string;
}
