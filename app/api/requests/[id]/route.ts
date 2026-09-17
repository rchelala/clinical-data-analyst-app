import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { sql } from '@/lib/db';
import { mapRequestRow } from '@/lib/brain-mappers';
import { RequestStatus } from '@/lib/brain-types';
import { requestAttachmentPathnameFromUrl } from '@/lib/request-attachments';
import { isValidDateString } from '@/lib/dates';

const VALID_STATUSES: RequestStatus[] = ['open', 'in_progress', 'done'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = Number(id);
    if (!Number.isFinite(requestId)) {
      return NextResponse.json({ error: 'Invalid request id.' }, { status: 400 });
    }

    const body = await req.json() as { status?: string; completedDate?: string | null };
    const { status, completedDate } = body;

    if (!status || !VALID_STATUSES.includes(status as RequestStatus)) {
      return NextResponse.json(
        { error: `status is required and must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    if (completedDate !== undefined && completedDate !== null && !isValidDateString(completedDate)) {
      return NextResponse.json(
        { error: 'completedDate must be a valid YYYY-MM-DD date.' },
        { status: 400 }
      );
    }

    // Transitioning to 'done' stamps completed_date — with the caller's local
    // date when provided (see lib/dates.ts toLocalDateString), falling back
    // to the server's CURRENT_DATE (UTC on Netlify) only when the client
    // didn't send one. The `status <> 'done'` check reads the bare (i.e.
    // pre-update) status column, so a client date is only applied when this
    // is an actual open/in_progress -> done transition; re-marking an
    // already-done request (the worklist checkbox always resends
    // completedDate alongside status: 'done', even as a no-op — see
    // statusPatchBody in app/worklist/page.tsx) keeps the existing
    // completed_date instead of resetting it. Transitioning away from 'done'
    // clears it so a re-opened request doesn't keep a stale date. Done via
    // branches rather than a nested sql fragment so we don't depend on
    // unverified nested-template-literal support in the driver.
    const rows =
      status === 'done'
        ? completedDate
          ? await sql`
              UPDATE requests
              SET status = ${status}, completed_date = CASE WHEN status <> 'done' THEN ${completedDate}::date ELSE completed_date END
              WHERE id = ${requestId}
              RETURNING id, dashboard_id, subscription_id, created_by_id, title, description, request_type, status, jira_ticket_id, created_date, completed_date, attachment_url, attachment_filename, field_names
            `
          : await sql`
              UPDATE requests
              SET status = ${status}, completed_date = CASE WHEN status <> 'done' THEN CURRENT_DATE ELSE completed_date END
              WHERE id = ${requestId}
              RETURNING id, dashboard_id, subscription_id, created_by_id, title, description, request_type, status, jira_ticket_id, created_date, completed_date, attachment_url, attachment_filename, field_names
            `
        : await sql`
            UPDATE requests
            SET status = ${status}, completed_date = NULL
            WHERE id = ${requestId}
            RETURNING id, dashboard_id, subscription_id, created_by_id, title, description, request_type, status, jira_ticket_id, created_date, completed_date, attachment_url, attachment_filename, field_names
          `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    }

    // UPDATE...RETURNING can't cleanly embed correlated subqueries against
    // other tables here, so fetch tags/related_requests in a second query
    // keyed by the known requestId and merge into the row before mapping.
    const tagsAndLinks = await sql`
      SELECT
        COALESCE(
          (SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
           FROM request_tags rt JOIN tags t ON t.id = rt.tag_id
           WHERE rt.request_id = ${requestId}),
          '[]'::json
        ) AS tags,
        COALESCE(
          (SELECT json_agg(json_build_object(
              'id', other.id, 'title', other.title, 'status', other.status,
              'dashboardId', other.dashboard_id, 'subscriptionId', other.subscription_id
            ))
           FROM request_links rl
           JOIN requests other ON other.id = (CASE WHEN rl.request_id_a = ${requestId} THEN rl.request_id_b ELSE rl.request_id_a END)
           WHERE rl.request_id_a = ${requestId} OR rl.request_id_b = ${requestId}),
          '[]'::json
        ) AS related_requests
    `;

    return NextResponse.json(mapRequestRow({ ...rows[0], ...tagsAndLinks[0] }));
  } catch (err: unknown) {
    console.error('Update request error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = Number(id);
    if (!Number.isFinite(requestId)) {
      return NextResponse.json({ error: 'Invalid request id.' }, { status: 400 });
    }

    // request_tags and request_links both have ON DELETE CASCADE on their
    // requests foreign keys (see scripts/migrations/005_tags_and_links.sql),
    // so deleting the row cleans those up automatically.
    const rows = await sql`
      DELETE FROM requests
      WHERE id = ${requestId}
      RETURNING attachment_url
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    }

    const attachmentUrl: string | null = rows[0].attachment_url;
    if (attachmentUrl) {
      // Only ever delete blobs under our own request-attachments/ prefix -
      // the blob store is shared with other features (cmio-trackers/,
      // cmio-reviews/, clinician-guides/), and this pathname ultimately
      // traces back to client input accepted on POST.
      const pathname = requestAttachmentPathnameFromUrl(attachmentUrl);
      if (pathname) {
        try {
          await del(pathname);
        } catch (blobErr: unknown) {
          // The DB row is already gone; a failed blob cleanup shouldn't fail
          // the overall request for the user.
          console.error('Delete request attachment blob error:', blobErr);
        }
      } else {
        console.error('Skipping blob delete for out-of-scope attachment pathname:', attachmentUrl);
      }
    }

    return NextResponse.json({ id: requestId }, { status: 200 });
  } catch (err: unknown) {
    console.error('Delete request error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
