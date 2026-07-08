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
  manualUrgency: UrgencyBucket | null;
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
  manualUrgency: UrgencyBucket | null;
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
  // Optional assignee display name, populated by queries that join the
  // owner analyst (e.g. the galaxy's per-entity task fetch). Absent on
  // plain inserts/updates that don't join analysts.
  ownerName?: string | null;
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
  totalTaskCount: number;
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

// Division Overview page: team-wide + per-division rollups used to gauge
// engagement/activity levels across all divisions at a glance.
export interface OverviewTotals {
  divisionsCovered: number;
  activeDashboards: number;      // status <> 'retired'
  activeSubscriptions: number;   // status <> 'retired'
  openRequests: number;          // status = 'open'
  inProgressRequests: number;    // status = 'in_progress'
  requestsCompletedRecent: number; // completed in last 90 days
  tasksCompletedRecent: number;    // completed in last 90 days
}

export type EngagementTier = 'active' | 'warm' | 'dormant';

export interface DivisionOverview {
  id: number;
  name: string;
  activeDashboards: number;
  totalDashboards: number;
  activeSubscriptions: number;
  totalSubscriptions: number;
  openRequests: number;
  inProgressRequests: number;
  completedRequests: number;      // all-time done
  openTasks: number;
  completedTasks: number;         // all-time done/completed_date
  lastActivityDate: string | null; // ISO date string; MAX across dashboards/subs last_touched_date and requests/tasks completed_date for this division
  daysSinceActivity: number | null;
  engagementScore: number;        // 0..100, transparent weighted blend
  engagementTier: EngagementTier;
}

export interface OverviewThroughputPoint {
  month: string;   // 'YYYY-MM'
  requests: number; // requests completed that month
  tasks: number;    // tasks completed that month
}

export interface OverviewResponse {
  totals: OverviewTotals;
  divisions: DivisionOverview[];  // sorted by engagementScore desc, then name
  throughput: OverviewThroughputPoint[]; // last 6 calendar months incl current, chronological
}

// Division Detail page: one division's dashboards, subscriptions, and the
// requests/tasks attached underneath them.
export interface DivisionDetailDashboard {
  id: number;
  name: string;
  status: DashboardStatus;
  ownerName: string | null;      // analysts.name via dashboards.analyst_id
  lastTouchedDate: string;
  openRequestCount: number;      // requests on this dashboard with status <> 'done'
}

export interface DivisionDetailSubscription {
  id: number;
  name: string;
  status: DashboardStatus;
  ownerName: string | null;      // via report_subscriptions.analyst_id
  lastTouchedDate: string;
  openRequestCount: number;
}

export interface DivisionDetailRequest {
  id: number;
  title: string;
  requestType: RequestType;
  status: RequestStatus;
  ownerName: string | null;      // analysts.name via requests.created_by_id (the logger/owner)
  parentKind: 'dashboard' | 'subscription';
  parentName: string;            // the dashboard/subscription it's attached to
  createdDate: string;
  completedDate: string | null;
}

export interface DivisionDetailTask {
  id: number;
  title: string;
  status: string;
  ownerName: string | null;      // analysts.name via tasks.owner_analyst_id
  contextKind: 'dashboard' | 'subscription' | 'division';
  contextName: string;           // dashboard/subscription name, or the division name for division-level tasks
  createdDate: string;
  completedDate: string | null;
}

export interface DivisionDetailResponse {
  id: number;
  name: string;
  dashboards: DivisionDetailDashboard[];       // ordered: active first, then by name
  subscriptions: DivisionDetailSubscription[]; // ordered: active first, then by name
  requests: DivisionDetailRequest[];           // all requests on this division's dashboards+subscriptions, newest first
  tasks: DivisionDetailTask[];                  // all tasks on this division's dashboards+subscriptions plus division-level tasks, newest first
}

// Monthly Summary report: tasks created/completed in a given calendar month,
// rolled up by division and grouped by the dashboard/subscription they belong to.
export interface MonthlySummaryTotals {
  divisions: number;
  created: number;
  completed: number;
  netOpen: number;     // created - completed
}

export interface MonthlyTaskRow {
  id: number;
  title: string;
  status: string;
  ownerName: string | null;      // analysts.name via tasks.owner_analyst_id
  createdDate: string | null;
  completedDate: string | null;
}

export interface MonthlyGroup {
  kind: 'dashboard' | 'subscription' | 'unlinked';
  name: string;                  // dashboard/subscription name, or a placeholder label when unlinked
  analystName: string | null;    // owner of the dashboard/subscription, if any
  tasks: MonthlyTaskRow[];
}

export interface DivisionMonthlySummary {
  id: number;
  name: string;
  created: number;
  completed: number;
  netOpen: number;     // created - completed
  groups: MonthlyGroup[];
}

export interface MonthlySummaryResponse {
  month: string;        // "YYYY-MM"
  totals: MonthlySummaryTotals;
  divisions: DivisionMonthlySummary[];
}

export interface MonthlyMonthListItem {
  month: string;        // "YYYY-MM"
  label: string;         // e.g. "July 2026"
  taskCount: number;
}
