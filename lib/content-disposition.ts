/**
 * Builds a safe `Content-Disposition: attachment` header value from a
 * possibly-untrusted filename (client-supplied, or stored in the DB from a
 * client-supplied value).
 *
 * Raw interpolation of a filename into this header lets a value containing
 * a `"`, CR/LF, or non-ASCII characters break out of the quoted string or
 * inject additional header fields. This strips those characters out of the
 * `filename` fallback param and percent-encodes a UTF-8 `filename*` param
 * (RFC 5987) so non-ASCII names still round-trip for clients that support it.
 */
export function attachmentContentDisposition(filename: string, fallback = "download"): string {
  // Strip CR/LF entirely (never even map to "_"), then replace anything
  // outside a safe ASCII set with "_".
  const stripped = filename.replace(/[\r\n]/g, "");
  const asciiSafe = sanitizeFilename(stripped, fallback);

  const encoded = encodeURIComponent(stripped || fallback).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encoded}`;
}

/**
 * Replaces anything outside a safe ASCII filename charset with "_" (CR/LF
 * included), trims, and falls back if the result is empty. Useful for
 * sanitizing a filename before it's persisted, not just before it's put in
 * a header.
 */
export function sanitizeFilename(filename: string, fallback = "download"): string {
  const stripped = filename.replace(/[\r\n]/g, "");
  return stripped.replace(/[^A-Za-z0-9._ -]/g, "_").trim() || fallback;
}
