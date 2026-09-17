import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapTaskRow } from '@/lib/brain-mappers';
import { normalizeNullableString } from '@/lib/normalize';
import { isValidDateString } from '@/lib/dates';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = Number(id);
    if (!Number.isInteger(taskId)) {
      return NextResponse.json({ error: 'Invalid task id.' }, { status: 400 });
    }

    const body = await req.json() as {
      title?: string;
      description?: string | null;
      status?: string;
      priority?: string | null;
      ownerAnalystId?: number | null;
      completedDate?: string | null;
      resolutionComment?: string | null;
    };
    const { title, status, completedDate } = body;
    const description = body.description;
    const priority = body.priority;
    const ownerAnalystId = body.ownerAnalystId;
    const resolutionComment = body.resolutionComment;

    if (
      title === undefined &&
      description === undefined &&
      status === undefined &&
      priority === undefined &&
      ownerAnalystId === undefined &&
      completedDate === undefined &&
      resolutionComment === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one field must be provided.' },
        { status: 400 }
      );
    }

    if (title !== undefined && !title.trim()) {
      return NextResponse.json({ error: 'title cannot be empty.' }, { status: 400 });
    }

    if (completedDate !== undefined && completedDate !== null && !isValidDateString(completedDate)) {
      return NextResponse.json(
        { error: 'completedDate must be a valid YYYY-MM-DD date.' },
        { status: 400 }
      );
    }

    // Single UPDATE that only touches columns actually present in the body
    // (via a CASE per column keyed on a "was this field provided" flag) —
    // no read-merge-write, so a concurrent PATCH to a *different* field on
    // the same task (e.g. a resolution note saved on blur while a status
    // change is in flight) can't clobber this one's change. 404 comes from
    // UPDATE...RETURNING finding no matching row.
    //
    // completed_date/resolution_comment derive from the status transition,
    // computed relative to the OLD `status`/`resolution_comment` columns
    // (bare column references in a Postgres UPDATE...SET always read
    // pre-update values, even when referenced in a later SET expression) —
    // this preserves the original fetch-merge-write semantics exactly:
    // - An explicitly provided completedDate wins only when the row is
    //   transitioning INTO 'done' (old status <> 'done') — the worklist
    //   client always sends completedDate alongside status: 'done' (see
    //   statusPatchBody in app/worklist/page.tsx), including when
    //   re-marking an already-done task, so this keeps that no-op from
    //   resetting completed_date. An explicitly provided resolutionComment
    //   always wins.
    // - Otherwise, entering 'done' stamps completed_date (CURRENT_DATE here
    //   is only a fallback), and leaving 'done' clears both completed_date
    //   and resolution_comment.
    // - Any other transition (or no status change) keeps the existing value.
    const trimmedTitle = title !== undefined ? title.trim() : undefined;
    const hasTitle = trimmedTitle !== undefined;
    const hasDescription = description !== undefined;
    const hasStatus = status !== undefined;
    const hasPriority = priority !== undefined;
    const hasOwnerAnalystId = ownerAnalystId !== undefined;
    const hasCompletedDate = completedDate !== undefined;
    const normalizedResolutionComment = normalizeNullableString(resolutionComment);
    const hasResolutionComment = normalizedResolutionComment !== undefined;
    const newStatusIsDone = hasStatus && status === 'done';
    const newStatusIsNotDone = hasStatus && status !== 'done';

    const rows = await sql`
      UPDATE tasks
      SET
        title = CASE WHEN ${hasTitle} THEN ${trimmedTitle ?? null}::text ELSE title END,
        description = CASE WHEN ${hasDescription} THEN ${description ?? null}::text ELSE description END,
        status = CASE WHEN ${hasStatus} THEN ${status ?? null}::text ELSE status END,
        priority = CASE WHEN ${hasPriority} THEN ${priority ?? null}::text ELSE priority END,
        owner_analyst_id = CASE WHEN ${hasOwnerAnalystId} THEN ${ownerAnalystId ?? null}::int ELSE owner_analyst_id END,
        completed_date = CASE
          WHEN ${hasCompletedDate} AND status <> 'done' THEN ${completedDate ?? null}::date
          WHEN ${newStatusIsDone} AND status <> 'done' THEN CURRENT_DATE
          WHEN ${newStatusIsNotDone} AND status = 'done' THEN NULL
          ELSE completed_date
        END,
        resolution_comment = CASE
          WHEN ${hasResolutionComment} THEN ${normalizedResolutionComment ?? null}::text
          WHEN ${newStatusIsNotDone} AND status = 'done' THEN NULL
          ELSE resolution_comment
        END
      WHERE id = ${taskId}
      RETURNING id, dashboard_id, subscription_id, division_id, psq_id, owner_analyst_id, created_by_id, title, description, status, priority, created_date, completed_date, resolution_comment
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }

    return NextResponse.json(mapTaskRow(rows[0]));
  } catch (err: unknown) {
    console.error('Update task error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced ownerAnalystId does not exist' },
        { status: 400 }
      );
    }
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
    const taskId = Number(id);
    if (!Number.isInteger(taskId)) {
      return NextResponse.json({ error: 'Invalid task id.' }, { status: 400 });
    }

    const rows = await sql`
      DELETE FROM tasks
      WHERE id = ${taskId}
      RETURNING id
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }

    return NextResponse.json({ id: taskId }, { status: 200 });
  } catch (err: unknown) {
    console.error('Delete task error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
