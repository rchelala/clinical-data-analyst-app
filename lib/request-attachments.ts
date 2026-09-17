// The blob store is shared across features (request-attachments/, cmio-trackers/,
// cmio-reviews/, clinician-guides/). Request-attachment endpoints accept a
// client-controlled `pathname`/`attachmentUrl`, so we must confirm it actually
// points inside this feature's own prefix before ever reading or deleting it -
// otherwise a crafted pathname could read or delete another feature's blob.

export const REQUEST_ATTACHMENT_PREFIX = 'request-attachments/';

// True only if `pathname` starts with our prefix, has a non-empty remainder,
// and that remainder can't be used to climb out of the prefix (no `..`
// segment, no backslash, no leading/duplicate slashes).
export function isRequestAttachmentPathname(pathname: string): boolean {
  if (!pathname.startsWith(REQUEST_ATTACHMENT_PREFIX)) {
    return false;
  }

  const rest = pathname.slice(REQUEST_ATTACHMENT_PREFIX.length);
  if (!rest || rest.includes('\\') || rest.startsWith('/')) {
    return false;
  }

  const segments = rest.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }

  return true;
}

// Parses `?pathname=` out of a stored/returned attachment URL the same way
// `[id]/route.ts` does, but only returns it when it's a valid
// request-attachments/ pathname. Never throws - a malformed URL just yields null.
export function requestAttachmentPathnameFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url, 'http://localhost').searchParams.get('pathname');
    if (pathname && isRequestAttachmentPathname(pathname)) {
      return pathname;
    }
    return null;
  } catch {
    return null;
  }
}
