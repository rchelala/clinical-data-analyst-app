// Single source of truth for Dashboard Brain types.
// DB columns are snake_case (see scripts/schema.sql); these interfaces use
// camelCase. The API layer is responsible for mapping between the two.

export interface Analyst {
  id: number;
  name: string;
}

export interface Division {
  id: number;
  name: string;
  sortOrder: number;
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
  urgency: number;
  radius: number;
}

export type RequestType = 'feature' | 'bug' | 'field_request';
export type RequestStatus = 'open' | 'in_progress' | 'done';

export interface Request {
  id: number;
  dashboardId: number;
  createdById: number;
  title: string;
  description: string | null;
  requestType: RequestType;
  status: RequestStatus;
  jiraTicketId: string | null;
  createdDate: string;
  completedDate: string | null;
}

export interface RequestWithCreator extends Request {
  createdByName: string;
}
