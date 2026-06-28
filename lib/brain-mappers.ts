// Shared snake_case (DB row) -> camelCase (API shape) mappers for the
// Dashboard Brain module. Centralized here because multiple routes map
// dashboards and/or requests.

import { Analyst, Dashboard, Division, Request, RequestWithCreator, ReportSubscription, Tag, Task, TaskWithContext, Psq, WorklistDashboard, WeeklyNote } from '@/lib/brain-types';

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
    priority: row.priority,
    enterpriseAnalyst: row.enterprise_analyst,
    comments: row.comments,
    notes: row.notes,
    worklistStatus: row.worklist_status,
    summary: row.summary,
  };
}

export function mapReportSubscriptionRow(row: any): ReportSubscription {
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
    priority: row.priority,
    enterpriseAnalyst: row.enterprise_analyst,
    comments: row.comments,
    notes: row.notes,
    worklistStatus: row.worklist_status,
    summary: row.summary,
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

export function mapTaskRow(row: any): Task {
  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    ownerAnalystId: row.owner_analyst_id,
    createdById: row.created_by_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    createdDate: row.created_date,
    completedDate: row.completed_date,
  };
}

export function mapTaskWithContextRow(row: any): TaskWithContext {
  return {
    ...mapTaskRow(row),
    dashboardName: row.dashboard_name,
    dashboardOwnerName: row.dashboard_owner_name,
    ownerName: row.owner_name,
  };
}

export function mapPsqRow(row: any): Psq {
  return {
    id: row.id,
    analystId: row.analyst_id,
    divisionId: row.division_id,
    year: row.year,
    name: row.name,
    status: row.status,
    tasks: row.tasks,
    comments: row.comments,
    notes: row.notes,
    enterpriseAnalyst: row.enterprise_analyst,
    summary: row.summary,
    createdDate: row.created_date,
    lastTouchedDate: row.last_touched_date,
  };
}

export function mapWorklistDashboardRow(row: any): WorklistDashboard {
  return {
    id: row.id,
    analystId: row.analyst_id,
    dashboardId: row.dashboard_id,
    addedDate: row.added_date,
  };
}

export function mapWeeklyNoteRow(row: any): WeeklyNote {
  return {
    id: row.id,
    analystId: row.analyst_id,
    weekStart: row.week_start,
    meetings: row.meetings,
  };
}
