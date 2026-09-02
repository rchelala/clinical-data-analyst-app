import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapTaskRow } from '@/lib/brain-mappers';
import { normalizeNullableString } from '@/lib/normalize';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = Number(id);
    if (!Number.isFinite(taskId)) {
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

    const current = await sql`
      SELECT id, dashboard_id, subscription_id, division_id, psq_id, owner_analyst_id, created_by_id, title, description, status, priority, created_date, completed_date, resolution_comment
      FROM tasks
      WHERE id = ${taskId}
    `;

    if (current.length === 0) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }

    const mergedStatus = status !== undefined ? status : current[0].status;
    const enteringDone = mergedStatus === 'done' && current[0].status !== 'done';
    const leavingDone = mergedStatus !== 'done' && current[0].status === 'done';

    // An explicitly provided completedDate always wins. Otherwise: entering
    // 'done' stamps today's date (via CURRENT_DATE in SQL below), leaving
    // 'done' clears it, and any other transition keeps the existing value.
    const shouldStampToday = completedDate === undefined && enteringDone;
    const mergedCompletedDate: string | null =
      completedDate !== undefined
        ? completedDate
        : leavingDone
          ? null
          : current[0].completed_date;

    const merged = {
      title: title !== undefined ? title.trim() : current[0].title,
      description: description !== undefined ? description : current[0].description,
      status: mergedStatus,
      priority: priority !== undefined ? priority : current[0].priority,
      ownerAnalystId: ownerAnalystId !== undefined ? ownerAnalystId : current[0].owner_analyst_id,
      completedDate: mergedCompletedDate,
      // An explicitly provided resolutionComment always wins. Otherwise,
      // re-opening a completed task clears its resolution note, mirroring
      // how completedDate is cleared above.
      resolutionComment:
        resolutionComment !== undefined
          ? normalizeNullableString(resolutionComment)
          : leavingDone
            ? null
            : current[0].resolution_comment,
    };

    const rows = shouldStampToday
      ? await sql`
          UPDATE tasks
          SET title = ${merged.title}, description = ${merged.description}, status = ${merged.status},
              priority = ${merged.priority}, owner_analyst_id = ${merged.ownerAnalystId},
              completed_date = CURRENT_DATE, resolution_comment = ${merged.resolutionComment}
          WHERE id = ${taskId}
          RETURNING id, dashboard_id, subscription_id, division_id, psq_id, owner_analyst_id, created_by_id, title, description, status, priority, created_date, completed_date, resolution_comment
        `
      : await sql`
          UPDATE tasks
          SET title = ${merged.title}, description = ${merged.description}, status = ${merged.status},
              priority = ${merged.priority}, owner_analyst_id = ${merged.ownerAnalystId},
              completed_date = ${merged.completedDate}, resolution_comment = ${merged.resolutionComment}
          WHERE id = ${taskId}
          RETURNING id, dashboard_id, subscription_id, division_id, psq_id, owner_analyst_id, created_by_id, title, description, status, priority, created_date, completed_date, resolution_comment
        `;

    return NextResponse.json(mapTaskRow(rows[0]));
  } catch (err: unknown) {
    console.error('Update task error:', err);
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503') {
      return NextResponse.json(
        { error: 'Referenced ownerAnalystId does not exist' },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = Number(id);
    if (!Number.isFinite(taskId)) {
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
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
