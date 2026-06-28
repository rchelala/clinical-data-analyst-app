import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';

export async function GET(req: NextRequest) {
  try {
    const pathname = req.nextUrl.searchParams.get('pathname');
    if (!pathname) {
      return NextResponse.json({ error: 'pathname is required.' }, { status: 400 });
    }

    const analystIdHeader = req.headers.get('x-analyst-id');
    if (!analystIdHeader) {
      return NextResponse.json(
        { error: 'x-analyst-id header is required.' },
        { status: 400 }
      );
    }
    const analystId = Number(analystIdHeader);
    if (!Number.isFinite(analystId)) {
      return NextResponse.json(
        { error: 'x-analyst-id header must be numeric.' },
        { status: 400 }
      );
    }

    const result = await get(pathname, { access: 'private' });

    if (result?.statusCode !== 200) {
      return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'attachment',
      },
    });
  } catch (err: unknown) {
    console.error('Download request attachment error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
