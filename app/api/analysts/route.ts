import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { mapAnalystRow } from '@/lib/brain-mappers';

// Pickers want the current team; anything that resolves an id to a name for
// existing work wants everyone, or a retired analyst's tasks render blank.
export async function GET(req: NextRequest) {
  try {
    const includeInactive = req.nextUrl.searchParams.get('includeInactive') === '1';

    const rows = includeInactive
      ? await sql`SELECT id, name, is_active FROM analysts ORDER BY name`
      : await sql`SELECT id, name, is_active FROM analysts WHERE is_active ORDER BY name`;

    return NextResponse.json(rows.map(mapAnalystRow));
  } catch (err: unknown) {
    console.error('List analysts error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  // Held outside the try so the 23505 handler can still look the name up.
  let name = '';

  try {
    const body = await req.json() as { name?: string };
    name = body.name?.trim() ?? '';

    if (!name) {
      return NextResponse.json({ error: 'name is required.' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO analysts (name, is_active)
      VALUES (${name}, true)
      RETURNING id, name, is_active
    `;

    return NextResponse.json(mapAnalystRow(rows[0]), { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      // Either UNIQUE (name) or the lower(name) index fired. Say which case
      // this is: a retired teammate comes back from the roster modal, not by
      // typing their name again.
      try {
        const existing = await sql`
          SELECT name, is_active FROM analysts WHERE lower(name) = lower(${name})
        `;
        if (existing.length > 0 && existing[0].is_active === false) {
          return NextResponse.json(
            {
              error: `${existing[0].name} is already on the roster but retired — bring them back from Manage roster.`,
            },
            { status: 409 }
          );
        }
      } catch {
        // Fall through to the generic duplicate message.
      }
      return NextResponse.json(
        { error: 'An analyst with this name already exists.' },
        { status: 409 }
      );
    }

    console.error('Create analyst error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
