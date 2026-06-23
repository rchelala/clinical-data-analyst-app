// Shared snake_case (DB row) -> camelCase (API shape) mappers for the
// Dashboard Brain module. Centralized here because multiple routes map
// dashboards and/or requests.

import { Analyst, Dashboard, Division, DivisionAnalystCoverage, Request, RequestWithCreator, ReportSubscription, Tag } from '@/lib/brain-types';

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
    createdByAnalystId: row.created_by_analyst_id,
  };
}

export function mapDivisionAnalystCoverageRow(row: any): DivisionAnalystCoverage {
  return {
    id: row.id,
    name: row.name,
    dashboardCount: Number(row.dashboard_count),
    subscriptionCount: Number(row.subscription_count),
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

export function mapReportSubscriptionRow(row: any): ReportSubscription {
  return {
    id: row.id,
    name: row.name,
    divisionId: row.division_id,
    analystId: row.analyst_id,
    linkedDashboardId: row.linked_dashboard_id,
    stakeholder: row.stakeholder,
    status: row.status,
    jiraTicketId: row.jira_ticket_id,
    lastTouchedDate: row.last_touched_date,
    createdDate: row.created_date,
  };
}

export function mapTagRow(row: any): Tag {
  return { id: row.id, name: row.name };
}

export function mapRequestRow(row: any): Request {
  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    subscriptionId: row.subscription_id,
    createdById: row.created_by_id,
    title: row.title,
    description: row.description,
    requestType: row.request_type,
    status: row.status,
    jiraTicketId: row.jira_ticket_id,
    createdDate: row.created_date,
    completedDate: row.completed_date,
    attachmentUrl: row.attachment_url,
    attachmentFilename: row.attachment_filename,
    tags: row.tags ?? [],
    relatedRequests: row.related_requests ?? [],
  };
}

export function mapRequestWithCreatorRow(row: any): RequestWithCreator {
  return {
    ...mapRequestRow(row),
    createdByName: row.created_by_name,
  };
}
