// Best-effort: turn a submission link into an iframe-able preview URL.
// Returns null when the link type doesn't embed cleanly (e.g. a GitHub
// Gist) - callers should fall back to a plain <a href> in that case.
export function toEmbedUrl(link) {
  if (!link) return null;

  const drive = link.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;

  const doc = link.match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([^/]+)/);
  if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`;

  const ytWatch = link.match(/youtube\.com\/watch\?v=([\w-]+)/);
  if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}`;

  const ytShort = link.match(/youtu\.be\/([\w-]+)/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`;

  return null;
}
