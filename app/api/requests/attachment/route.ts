import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { REQUEST_ATTACHMENT_PREFIX } from '@/lib/request-attachments';

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

    // isRequestAttachmentPathname (lib/request-attachments.ts) rejects any
    // pathname containing a backslash or "/" segment, but file.name is
    // whatever the client sent — so a name with one of those characters
    // would upload fine here and then fail every later lookup/delete.
    // Sanitize just the pathname we store under; the original name is
    // still returned as `filename` for display.
    const safeNameForPathname = file.name.replace(/[/\\]/g, '_');

    const blob = await put(`${REQUEST_ATTACHMENT_PREFIX}${crypto.randomUUID()}-${safeNameForPathname}`, file, {
      access: 'private',
    });

    return NextResponse.json(
      { url: `/api/requests/attachment/download?pathname=${encodeURIComponent(blob.pathname)}`, filename: file.name },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error('Upload request attachment error:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing your request. Please try again.' },
      { status: 500 }
    );
  }
}
