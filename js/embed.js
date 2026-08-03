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

// Android-only escape hatch for links that don't embed (toEmbedUrl() above
// returned null, so the caller fell back to a plain <a target="_blank">) -
// on some Android phones the OS hands that tap to whatever app claims the
// file type instead of Chrome (seen in the field: a "Document Viewer" app
// that can't parse it), with no in-page error. intent:// with an explicit
// package forces Chrome specifically. No iOS equivalent exists (Apple gives
// pages no way to pick the handler), so this renders nothing there.
export function openInChromeButton(url) {
  if (!/Android/i.test(navigator.userAgent || "")) return "";
  const bare = url.replace(/^https?:\/\//, "");
  return ` <button type="button" class="secondary open-in-chrome" data-open-chrome-bare="${encodeURIComponent(bare)}">Open in Chrome</button>`;
}

export function wireOpenInChromeButtons(container) {
  container.addEventListener("click", (e) => {
    const b = e.target.closest("[data-open-chrome-bare]");
    if (!b) return;
    const bare = decodeURIComponent(b.dataset.openChromeBare);
    window.location.href = `intent://${bare}#Intent;scheme=https;package=com.android.chrome;end`;
  });
}
