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

export interface DivisionAnalystCoverage {
  id: number;
  name: string;
  dashboardCount: number;
  subscriptionCount: number;
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
  priority: string | null;
  enterpriseAnalyst: string | null;
  comments: string | null;
  notes: string | null;
  worklistStatus: string | null;
  summary: string | null;
}

export interface DashboardWithUrgency extends Dashboard {
  openRequestCount: number;
  inProgressRequestCount: number;
  urgency: number;
  radius: number;
}

export type BrainEntityKind = 'dashboard' | 'subscription';

// Shape returned by AddEntityForm's onCreated callback after a successful
// create, so callers (e.g. the intake "convert" flow) know what was just
// created without re-deriving it from form state.
export interface CreatedBrainEntity {
  id: number;
  kind: BrainEntityKind;
}

export interface ReportSubscription {
  id: number;
  name: string;
  divisionId: number;
  analystId: number | null;
  linkedDashboardId: number | null;
  stakeholder: string | null;
  status: DashboardStatus; // reuse the existing status union type, it's generic enough
  jiraTicketId: string | null;
  lastTouchedDate: string;
  createdDate: string;
  priority: string | null;
  enterpriseAnalyst: string | null;
  comments: string | null;
  notes: string | null;
  worklistStatus: string | null;
  summary: string | null;
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

// Status/priority are free-form (not enforced by a DB enum/check constraint),
// matching the documented-but-unenforced convention used by dashboards.status.
export interface Task {
  id: number;
  dashboardId: number | null;
  subscriptionId: number | null;
  divisionId: number | null;
  psqId: number | null;
  ownerAnalystId: number | null;
  createdById: number;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  createdDate: string;
  completedDate: string | null;
}

export interface TaskWithContext extends Task {
  contextType: 'dashboard' | 'subscription' | 'division' | 'psq';
  contextName: string;
  contextOwnerName: string | null;
  ownerName: string | null;
}

export interface Psq {
  id: number;
  analystId: number;
  divisionId: number | null;
  year: number | null;
  name: string;
  status: string | null;
  tasks: string | null;
  comments: string | null;
  notes: string | null;
  enterpriseAnalyst: string | null;
  summary: string | null;
  createdDate: string;
  lastTouchedDate: string;
  dashboardId: number | null;
}

export interface PsqWithTaskCount extends Psq {
  activeTaskCount: number;
}

export interface WorklistDashboard {
  id: number;
  analystId: number;
  dashboardId: number;
  addedDate: string;
}

export interface WeeklyNote {
  id: number;
  analystId: number;
  weekStart: string;
  meetings: string | null;
}

// Intake requests: an "Unassigned" backlog of dashboard/subscription requests
// that don't yet have an owning analyst.
export type IntakePriority = 'low' | 'medium' | 'high';
export type IntakeStatus = 'not_started' | 'discovery' | 'ready' | 'in_progress' | 'on_hold' | 'fulfilled';

export interface IntakeRequest {
  id: number;
  priority: IntakePriority;
  dateReceived: string;
  divisionId: number | null;
  topic: string;
  stakeholder: string | null;
  analystId: number | null;
  requestedKind: BrainEntityKind | null;
  status: IntakeStatus;
  ticketLink: string | null;
  internalComments: string | null;
  createdDate: string;
  fulfilledEntityKind: BrainEntityKind | null;
  fulfilledEntityId: number | null;
}

export interface IntakeRequestWithNames extends IntakeRequest {
  divisionName: string | null;
  analystName: string | null;
}
