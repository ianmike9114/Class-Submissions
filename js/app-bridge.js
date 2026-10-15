// Bridge to the optional Android app (android-app/, a Capacitor wrapper that
// loads this live site in a WebView). Everything here is a no-op in a normal
// browser, so the website behaves exactly as before.
//
// Why the app exists: a web page can never block screenshots. The app's
// PrivacyScreen plugin sets Android's FLAG_SECURE while a module (material) or
// quiz is open, so screenshots/screen recordings come out black there; other
// screens stay screenshot-able for error reports. The flag outlives page
// loads, so the sign-in and teacher pages turn it off. Google also refuses its
// sign-in inside WebViews (disallowed_useragent), so in the app sign-in goes
// through the native FirebaseAuthentication plugin and only the resulting ID
// token is handed to the page's Firebase JS SDK (js/auth.js).

// Free APK download (GitHub Releases, built by .github/workflows/android-apk.yml).
export const APP_APK_URL = "https://github.com/ianmike9114/Class-Submissions/releases/latest/download/class-submissions.apk";

// Also appended to the WebView's user agent by android-app/capacitor.config.json.
const APP_UA_MARK = "ClassSubmissionsApp/";

export function isLmsApp() {
  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
  } catch { /* not in the app */ }
  return navigator.userAgent.includes(APP_UA_MARK);
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent || "");
}

// An Android phone in a normal browser - the one case where offering the APK
// download makes sense (not iPhone, not desktop, not already in the app).
export function wantsApk() {
  return isAndroid() && !isLmsApp();
}

// Install steps shown next to every APK download link (quiz gate, the
// "Get the Android app" button, the student banner). No browser can install
// an APK by itself - Android always asks the student to open the file.
export const APK_INSTALL_STEPS_HTML = `
  <ol class="muted quiz-rules">
    <li>Open the downloaded file (class-submissions.apk). If Chrome warns about the file, tap "Download anyway".</li>
    <li>If asked, allow your browser to "install unknown apps", then tap Install.</li>
    <li>Open <strong>Class Submissions</strong> and sign in with the same Gmail.</li>
  </ol>`;

function plugin(name) {
  const cap = window.Capacitor;
  if (!cap) return null;
  try {
    return cap.registerPlugin ? cap.registerPlugin(name) : cap.Plugins?.[name] || null;
  } catch {
    return cap.Plugins?.[name] || null;
  }
}

// On while a module/quiz is open, off otherwise. Never throws - a failure just means the
// screenshot block isn't active (the web anti-cheat still runs).
export async function setScreenshotBlock(on) {
  if (!isLmsApp()) return;
  try {
    const ps = plugin("PrivacyScreen");
    if (ps) await (on ? ps.enable() : ps.disable());
  } catch (e) {
    console.warn("PrivacyScreen", e);
  }
}

// Native Google account picker -> Google ID token for signInWithCredential.
export async function nativeGoogleIdToken() {
  const fa = plugin("FirebaseAuthentication");
  if (!fa) throw new Error("Sign-in isn't available in this version of the app - update the app.");
  let result;
  try {
    // Android's newer Credential Manager picker.
    result = await fa.signInWithGoogle({ skipNativeAuth: true });
  } catch (err) {
    if (/cancel/i.test(err?.message || "")) throw err;
    // It fails on some phones that do have Google Play Services (e.g. no
    // account added yet -> "No credentials available", or an older Play
    // services). Retry once with the classic Google account picker, which
    // also offers "Add another account". Supported by the installed APK
    // (@capacitor-firebase/authentication useCredentialManager), so no
    // app update is needed.
    console.warn("Credential Manager sign-in failed, trying the classic picker:", err);
    try {
      result = await fa.signInWithGoogle({ skipNativeAuth: true, useCredentialManager: false });
    } catch (err2) {
      if (/cancel/i.test(err2?.message || "")) throw err2;
      err2.firstError = err?.message || String(err);
      throw err2;
    }
  }
  const idToken = result?.credential?.idToken;
  if (!idToken) throw new Error("Google sign-in was cancelled.");
  return idToken;
}
