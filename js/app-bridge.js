// Bridge to the optional Android app (android-app/, a Capacitor wrapper that
// loads this live site in a WebView). Everything here is a no-op in a normal
// browser, so the website behaves exactly as before.
//
// Why the app exists: a web page can never block screenshots. The app's
// PrivacyScreen plugin sets Android's FLAG_SECURE while a quiz is open, so
// screenshots/screen recordings come out black. Google also refuses its
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

function plugin(name) {
  const cap = window.Capacitor;
  if (!cap) return null;
  try {
    return cap.registerPlugin ? cap.registerPlugin(name) : cap.Plugins?.[name] || null;
  } catch {
    return cap.Plugins?.[name] || null;
  }
}

// On during a quiz, off after. Never throws - a failure just means the
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
  const result = await fa.signInWithGoogle({ skipNativeAuth: true });
  const idToken = result?.credential?.idToken;
  if (!idToken) throw new Error("Google sign-in was cancelled.");
  return idToken;
}
