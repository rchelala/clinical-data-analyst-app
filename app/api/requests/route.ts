import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapRequestRow, mapRequestWithCreatorRow } from '@/lib/brain-mappers';
import { RequestType } from '@/lib/brain-types';
import { requestAttachmentPathnameFromUrl } from '@/lib/request-attachments';
import { isValidDateString } from '@/lib/dates';

const VALID_REQUEST_TYPES = ['feature', 'bug', 'field_request'] as const;

// Keeps only non-empty string items, trims them, caps each to 200 chars and
// the list to 200 items. Returns null when the input isn't a usable array or
// ends up empty, so we can store NULL instead of an empty jsonb array.
function sanitizeFieldNames(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const names = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 200)
    .map((item) => item.slice(0, 200));
  return names.length > 0 ? names : null;
}

export async function GET(req: NextRequest) {
  try {
    const dashboardIdParam = req.nextUrl.searchParams.get('dashboardId');
    const subscriptionIdParam = req.nextUrl.searchParams.get('subscriptionId');

    const dashboardId = dashboardIdParam ? Number(dashboardIdParam) : NaN;
    const subscriptionId = subscriptionIdParam ? Number(subscriptionIdParam) : NaN;

    const hasDashboardId = !!dashboardIdParam && Number.isFinite(dashboardId);
    const hasSubscriptionId = !!subscriptionIdParam && Number.isFinite(subscriptionId);

    if (hasDashboardId === hasSubscriptionId) {
      return NextResponse.json(
        { error: 'Provide exactly one of dashboardId or subscriptionId query params, and it must be numeric.' },
        { status: 400 }
      );
    }

    const rows = hasDashboardId
      ? await sql`
          SELECT
            r.id,
            r.dashboard_id,
            r.subscription_id,
            r.created_by_id,
            r.title,
            r.description,
            r.request_type,
            r.status,
            r.jira_ticket_id,
            r.created_date,
            r.completed_date,
            r.attachment_url,
            r.attachment_filename,
            r.field_names,
            a.name AS created_by_name,
            COALESCE(
              (SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
               FROM request_tags rt JOIN tags t ON t.id = rt.tag_id
               WHERE rt.request_id = r.id),
              '[]'::json
            ) AS tags,
            COALESCE(
              (SELECT json_agg(json_build_object(
                  'id', other.id, 'title', other.title, 'status', other.status,
                  'dashboardId', other.dashboard_id, 'subscriptionId', other.subscription_id
                ))
               FROM request_links rl
               JOIN requests other ON other.id = (CASE WHEN rl.request_id_a = r.id THEN rl.request_id_b ELSE rl.request_id_a END)
               WHERE rl.request_id_a = r.id OR rl.request_id_b = r.id),
              '[]'::json
            ) AS related_requests
          FROM requests r
          JOIN analysts a ON a.id = r.created_by_id
          WHERE r.dashboard_id = ${dashboardId}
          ORDER BY r.created_date DESC
        `
      : await sql`
          SELECT
            r.id,
            r.dashboard_id,
            r.subscription_id,
            r.created_by_id,
            r.title,
            r.description,
            r.request_type,
            r.status,
            r.jira_ticket_id,
            r.created_date,
            r.completed_date,
            r.attachment_url,
            r.attachment_filename,
            r.field_names,
            a.name AS created_by_name,
            COALESCE(
              (SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
               FROM request_tags rt JOIN tags t ON t.id = rt.tag_id
               WHERE rt.request_id = r.id),
              '[]'::json
            ) AS tags,
            COALESCE(
              (SELECT json_agg(json_build_object(
                  'id', other.id, 'title', other.title, 'status', other.status,
                  'dashboardId', other.dashboard_id, 'subscriptionId', other.subscription_id
                ))
               FROM request_links rl
               JOIN requests other ON other.id = (CASE WHEN rl.request_id_a = r.id THEN rl.request_id_b ELSE rl.request_id_a END)
               WHERE rl.request_id_a = r.id OR rl.request_id_b = r.id),
              '[]'::json
            ) AS related_requests
          FROM requests r
          JOIN analysts a ON a.id = r.created_by_id
          WHERE r.subscription_id = ${subscriptionId}
          ORDER BY r.created_date DESC
        `;

    return NextResponse.json(rows.map(mapRequestWithCreatorRow));
  } catch (err: unknown) {
    console.error('List requests error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const analystIdHeader = req.headers.get('x-analyst-id');
    if (!analystIdHeader) {
      return NextResponse.json(
        { error: 'x-analyst-id header is required.' },
        { status: 400 }
      );
    }
    const createdById = Number(analystIdHeader);
    if (!Number.isFinite(createdById)) {
      return NextResponse.json(
        { error: 'x-analyst-id header must be numeric.' },
        { status: 400 }
      );
    }

    const body = await req.json() as {
      dashboardId?: number;
      subscriptionId?: number;
      title?: string;
      description?: string;
      requestType?: string;
      jiraTicketId?: string;
      attachmentUrl?: string;
      attachmentFilename?: string;
      fieldNames?: unknown;
      createdDate?: string | null;
    };

    const {
      dashboardId,
      subscriptionId,
      title,
      description,
      requestType,
      jiraTicketId,
      attachmentUrl,
      attachmentFilename,
      fieldNames,
      createdDate,
    } = body;

    const sanitizedFieldNames = sanitizeFieldNames(fieldNames);

    const hasDashboardId = dashboardId !== undefined && dashboardId !== null;
    const hasSubscriptionId = subscriptionId !== undefined && subscriptionId !== null;

    if (hasDashboardId === hasSubscriptionId) {
      return NextResponse.json(
        { error: 'Provide exactly one of dashboardId or subscriptionId.' },
        { status: 400 }
      );
    }

    if (!title?.trim()) {
      return NextResponse.json(
        { error: 'title is required.' },
        { status: 400 }
      );
    }

    if (requestType !== undefined && !VALID_REQUEST_TYPES.includes(requestType as RequestType)) {
      return NextResponse.json(
        { error: `requestType must be one of: ${VALID_REQUEST_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // The blob store is shared across features, so only accept an
    // attachmentUrl that actually points at our own request-attachments/
    // prefix - otherwise a crafted URL could later be used to delete or
    // read another feature's blob (see [id]/route.ts DELETE).
    if (attachmentUrl != null && !requestAttachmentPathnameFromUrl(attachmentUrl)) {
      return NextResponse.json(
        { error: 'attachmentUrl is invalid.' },
        { status: 400 }
      );
    }

    if (createdDate !== undefined && createdDate !== null && !isValidDateString(createdDate)) {
      return NextResponse.json(
        { error: 'createdDate must be a valid YYYY-MM-DD date.' },
        { status: 400 }
      );
    }

    // created_date defaults to CURRENT_DATE (UTC on Netlify) when the client
    // doesn't send one; when it does (see lib/dates.ts toLocalDateString),
    // that local date is used instead so a request created late in a US
    // evening isn't stamped with tomorrow's date.
    const rows = await sql`
      INSERT INTO requests (dashboard_id, subscription_id, created_by_id, title, description, request_type, jira_ticket_id, attachment_url, attachment_filename, field_names, created_date)
      VALUES (${dashboardId ?? null}, ${subscriptionId ?? null}, ${createdById}, ${title}, ${description ?? null}, ${requestType ?? 'feature'}, ${jiraTicketId ?? null}, ${attachmentUrl ?? null}, ${attachmentFilename ?? null}, ${sanitizedFieldNames ? JSON.stringify(sanitizedFieldNames) : null}::jsonb, COALESCE(${createdDate ?? null}::date, CURRENT_DATE))
      RETURNING id, dashboard_id, subscription_id, created_by_id, title, description, request_type, status, jira_ticket_id, created_date, completed_date, attachment_url, attachment_filename, field_names
    `;

    return NextResponse.json(mapRequestRow(rows[0]), { status: 201 });
  } catch (err: unknown) {
    console.error('Create request error:', err);
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') {
        return NextResponse.json(
          { error: 'Referenced dashboardId/subscriptionId does not exist' },
          { status: 400 }
        );
      }
      if (code === '23514') {
        return NextResponse.json(
          { error: 'Provide exactly one of dashboardId or subscriptionId.' },
          { status: 400 }
        );
      }
    }
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
