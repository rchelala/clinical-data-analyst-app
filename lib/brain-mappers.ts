// Shared snake_case (DB row) -> camelCase (API shape) mappers for the
// Dashboard Brain module. Centralized here because multiple routes map
// dashboards and/or requests.

import { Analyst, Dashboard, Division, Request, RequestWithCreator } from '@/lib/brain-types';

export function mapAnalystRow(row: any): Analyst {
  return {
    id: row.id,
    name: row.name,
  };
}

export function mapDivisionRow(row: any): Division {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
  };
}

export function mapDashboardRow(row: any): Dashboard {
  return {
    id: row.id,
    name: row.name,
    divisionId: row.division_id,
    analystId: row.analyst_id,
    stakeholder: row.stakeholder,
    status: row.status,
    jiraTicketId: row.jira_ticket_id,
    lastTouchedDate: row.last_touched_date,
    createdDate: row.created_date,
  };
}

export function mapRequestRow(row: any): Request {
  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    createdById: row.created_by_id,
    title: row.title,
    description: row.description,
    requestType: row.request_type,
    status: row.status,
    jiraTicketId: row.jira_ticket_id,
    createdDate: row.created_date,
    completedDate: row.completed_date,
  };
}

export function mapRequestWithCreatorRow(row: any): RequestWithCreator {
  return {
    ...mapRequestRow(row),
    createdByName: row.created_by_name,
  };
}
