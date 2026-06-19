import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required.' }, { status: 400 });
    }

    const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );
    if (!hasAllowedExtension) {
      return NextResponse.json(
        { error: `Only ${ALLOWED_EXTENSIONS.join(', ')} files are supported.` },
        { status: 400 }
      );
    }

    const blob = await put(`request-attachments/${Date.now()}-${file.name}`, file, {
      access: 'private',
    });

    return NextResponse.json(
      { url: `/api/requests/attachment/download?pathname=${encodeURIComponent(blob.pathname)}`, filename: file.name },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error('Upload request attachment error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
