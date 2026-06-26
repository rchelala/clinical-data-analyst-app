import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { sql } from '@/lib/db';
import { mapRequestRow } from '@/lib/brain-mappers';
import { RequestStatus } from '@/lib/brain-types';

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

    const body = await req.json() as { status?: string };
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status as RequestStatus)) {
      return NextResponse.json(
        { error: `status is required and must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Transitioning to 'done' stamps completed_date; transitioning away from
    // 'done' clears it so a re-opened request doesn't keep a stale date.
    // Done via two branches rather than a nested sql fragment so we don't
    // depend on unverified nested-template-literal support in the driver.
    const rows =
      status === 'done'
        ? await sql`
            UPDATE requests
            SET status = ${status}, completed_date = CURRENT_DATE
            WHERE id = ${requestId}
            RETURNING id, dashboard_id, subscription_id, created_by_id, title, description, request_type, status, jira_ticket_id, created_date, completed_date, attachment_url, attachment_filename
          `
        : await sql`
            UPDATE requests
            SET status = ${status}, completed_date = NULL
            WHERE id = ${requestId}
            RETURNING id, dashboard_id, subscription_id, created_by_id, title, description, request_type, status, jira_ticket_id, created_date, completed_date, attachment_url, attachment_filename
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
      try {
        const pathname = new URL(attachmentUrl, 'http://localhost').searchParams.get('pathname');
        if (pathname) {
          await del(pathname);
        }
      } catch (blobErr: unknown) {
        // The DB row is already gone; a failed blob cleanup shouldn't fail
        // the overall request for the user.
        console.error('Delete request attachment blob error:', blobErr);
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
