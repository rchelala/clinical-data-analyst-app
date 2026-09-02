// Shared snake_case (DB row) -> camelCase (API shape) mappers for the
// Dashboard Brain module. Centralized here because multiple routes map
// dashboards and/or requests.

import { Analyst, Dashboard, Division, DivisionAnalystCoverage, IntakeRequest, IntakeRequestWithNames, Request, RequestWithCreator, ReportSubscription, Tag, Task, TaskWithContext, Psq, PsqWithTaskCount, WorklistDashboard, WeeklyNote } from '@/lib/brain-types';

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
    priority: row.priority,
    enterpriseAnalyst: row.enterprise_analyst,
    comments: row.comments,
    notes: row.notes,
    worklistStatus: row.worklist_status,
    summary: row.summary,
    manualUrgency: row.manual_urgency ?? null,
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
    priority: row.priority,
    enterpriseAnalyst: row.enterprise_analyst,
    comments: row.comments,
    notes: row.notes,
    worklistStatus: row.worklist_status,
    summary: row.summary,
    manualUrgency: row.manual_urgency ?? null,
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
    subscriptionId: row.subscription_id,
    divisionId: row.division_id,
    psqId: row.psq_id,
    ownerAnalystId: row.owner_analyst_id,
    createdById: row.created_by_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    createdDate: row.created_date,
    completedDate: row.completed_date,
    resolutionComment: row.resolution_comment ?? null,
    // Present only when the query joins the owner analyst; otherwise undefined.
    ownerName: row.owner_name ?? null,
  };
}

export function mapTaskWithContextRow(row: any): TaskWithContext {
  return {
    ...mapTaskRow(row),
    contextType: row.context_type,
    contextName: row.context_name,
    contextOwnerName: row.context_owner_name,
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
    dashboardId: row.dashboard_id,
  };
}

export function mapPsqWithTaskCountRow(row: any): PsqWithTaskCount {
  return {
    ...mapPsqRow(row),
    activeTaskCount: Number(row.active_task_count),
    totalTaskCount: Number(row.total_task_count),
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

export function mapIntakeRequestRow(row: any): IntakeRequest {
  return {
    id: row.id,
    priority: row.priority,
    dateReceived: row.date_received,
    divisionId: row.division_id,
    topic: row.topic,
    stakeholder: row.stakeholder,
    analystId: row.analyst_id,
    requestedKind: row.requested_kind,
    status: row.status,
    ticketLink: row.ticket_link,
    internalComments: row.internal_comments,
    createdDate: row.created_date,
    fulfilledEntityKind: row.fulfilled_entity_kind,
    fulfilledEntityId: row.fulfilled_entity_id,
  };
}

export function mapIntakeRequestWithNamesRow(row: any): IntakeRequestWithNames {
  return {
    ...mapIntakeRequestRow(row),
    divisionName: row.division_name,
    analystName: row.analyst_name,
  };
}
