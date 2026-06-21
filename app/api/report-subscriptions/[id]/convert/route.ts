import { NextRequest, NextResponse } from 'next/server';
import { convertSubscriptionToDashboard, isValidStatus, VALID_STATUSES } from '@/lib/entity-conversion';

// Trims a provided string field to null when empty, matching the
// null-vs-empty-string normalization EditEntityForm already applies
// client-side. `undefined` (not provided) and `null` (explicit clear)
// pass through unchanged.
function normalizeNullableString(value: string | null | undefined): string | null | undefined {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const subscriptionId = Number(id);
    if (!Number.isFinite(subscriptionId)) {
      return NextResponse.json({ error: 'Invalid report subscription id.' }, { status: 400 });
    }

    const rawBody = await req.text();
    const body = rawBody ? JSON.parse(rawBody) as {
      name?: string;
      stakeholder?: string | null;
      status?: string;
      jiraTicketId?: string | null;
    } : {};
    const { name, status } = body;
    const stakeholder = normalizeNullableString(body.stakeholder);
    const jiraTicketId = normalizeNullableString(body.jiraTicketId);

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: 'name cannot be empty.' }, { status: 400 });
    }

    if (status !== undefined && !isValidStatus(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const result = await convertSubscriptionToDashboard(subscriptionId, {
      name: name !== undefined ? name.trim() : undefined,
      stakeholder,
      status,
      jiraTicketId,
    });

    if (result === null) {
      return NextResponse.json({ error: 'Report subscription not found.' }, { status: 404 });
    }

    return NextResponse.json({ ...result, kind: 'dashboard' });
  } catch (err: unknown) {
    console.error('Convert report subscription to dashboard error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
