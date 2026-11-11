// Small shared UI feedback helpers (no Firestore, no DOM dependencies on page
// markup): toast() for plain success confirmations, friendlyError() for
// turning raw Firebase errors into words a student/teacher can act on.
// Errors and destructive confirms keep using alert()/confirm().

let region = null;

function ensureRegion() {
  if (region && region.isConnected) return region;
  region = document.createElement("div");
  region.className = "toast-region";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  document.body.appendChild(region);
  return region;
}

// Non-blocking message that hides itself. Safe to call right before a
// re-render (it lives outside the page's own containers).
export function toast(message, ms = 3200) {
  try {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    ensureRegion().appendChild(el);
    setTimeout(() => {
      el.classList.add("toast-out");
      setTimeout(() => el.remove(), 250);
    }, ms);
  } catch {
    // Never let a cosmetic toast break the action that triggered it.
  }
}

// Maps a Firebase/network error to plain English. The raw error is always
// logged so it stays visible in the console (and ?debug=1).
export function friendlyError(err) {
  console.error(err);
  const code = String(err?.code || "").replace(/^(firestore|auth|functions)\//, "");
  const msg = String(err?.message || "");
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You seem to be offline. Check your internet connection and try again.";
  }
  switch (code) {
    case "permission-denied":
      return "You don't have permission to do that. If this keeps happening, sign out and sign in again, or tell your teacher.";
    case "unauthenticated":
    case "user-token-expired":
    case "requires-recent-login":
      return "Your sign-in expired. Please sign in again.";
    case "unavailable":
    case "network-request-failed":
      return "Can't reach the server. Check your internet connection and try again.";
    case "deadline-exceeded":
      return "That took too long. Check your connection and try again.";
    case "resource-exhausted":
      return "The system is busy right now. Please try again in a few minutes.";
    case "not-found":
      return "That item no longer exists. Refresh the page and try again.";
    case "failed-precondition":
    case "aborted":
      return "Something changed while you were working. Refresh the page and try again.";
    default:
  }
  if (/network|offline|failed to fetch|timed? ?out/i.test(msg)) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  return "Something went wrong. Please try again, and tell your teacher if it keeps happening.";
}
