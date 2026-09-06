/*
 * In-app "Install app" button wiring (PWA).
 *
 * One shared helper used by index.html, student.html and teacher.html. The
 * button lives in the page hidden (class "hidden") and this reveals it only
 * when installing actually makes sense:
 *
 *  - Android/Chromium: the browser fires `beforeinstallprompt` when the site
 *    is installable. We stash that event, show the button, and fire the
 *    native install dialog on click.
 *  - iOS Safari: no `beforeinstallprompt` and no programmatic install exists,
 *    so we show the button anyway and, on click, tell the user how to do it
 *    manually (Share -> Add to Home Screen).
 *  - Already installed (running standalone): keep the button hidden - no point
 *    offering install from inside the installed app.
 */

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag when launched from the home screen.
    window.navigator.standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent || "";
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Mac; detect it by the touch-capable "Mac".
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

export function initInstallButton(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  // Never offer install from inside the already-installed app.
  if (isStandalone()) {
    btn.classList.add("hidden");
    return;
  }

  let deferredPrompt = null;

  // Android/Chromium path: capture the install event, reveal the button.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.classList.remove("hidden");
  });

  // iOS has no beforeinstallprompt - show the button up front so the user
  // still has an obvious way in (click shows manual steps below).
  if (isIos()) {
    btn.classList.remove("hidden");
  }

  btn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch {
        /* user dismissed - nothing to do */
      }
      // A prompt can only be used once; drop it and hide the button.
      deferredPrompt = null;
      btn.classList.add("hidden");
      return;
    }
    if (isIos()) {
      alert(
        "To install this app on your iPhone/iPad:\n\n" +
          "1. Tap the Share button (the square with an up-arrow) in Safari's toolbar.\n" +
          '2. Scroll down and tap "Add to Home Screen".\n' +
          '3. Tap "Add".'
      );
      return;
    }
    // Desktop/Android where the prompt isn't available yet (or was already
    // used): point at the browser menu as a fallback.
    alert(
      'To install: open your browser menu (⋮) and choose "Install app" / ' +
        '"Add to Home screen".'
    );
  });

  // If the app gets installed, hide the button.
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    btn.classList.add("hidden");
  });
}
