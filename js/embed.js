// Extracts the file ID from a Drive file link, or null if it isn't one.
// Shared by toEmbedUrl() (iframe preview) and js/gemini.js (fetching the
// actual image bytes for vision input on "image" assignments).
export function extractDriveFileId(link) {
  const match = link?.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  return match ? match[1] : null;
}

// Best-effort: turn a submission link into an iframe-able preview URL.
// Returns null when the link type doesn't embed cleanly (e.g. a GitHub
// Gist) - callers should fall back to a plain <a href> in that case.
export function toEmbedUrl(link) {
  if (!link) return null;

  const driveId = extractDriveFileId(link);
  if (driveId) return `https://drive.google.com/file/d/${driveId}/preview`;

  // A folder link (the standard way to share multiple files at once) -
  // #grid gives a thumbnail grid, better than #list for image/PDF worksheets.
  const folder = link.match(/drive\.google\.com\/drive\/folders\/([^/?#]+)/);
  if (folder) return `https://drive.google.com/embeddedfolderview?id=${folder[1]}#grid`;

  const doc = link.match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([^/]+)/);
  if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`;

  const ytWatch = link.match(/youtube\.com\/watch\?v=([\w-]+)/);
  if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}`;

  const ytShort = link.match(/youtu\.be\/([\w-]+)/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`;

  const codepen = link.match(/codepen\.io\/([^/]+)\/pen\/([^/?#]+)/);
  if (codepen) return `https://codepen.io/${codepen[1]}/embed/${codepen[2]}?default-tab=result`;

  return null;
}
