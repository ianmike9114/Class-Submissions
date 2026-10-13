# Class Submissions — Android app

A thin **Capacitor** wrapper (not React Native) that opens the live site
`https://deped-class-submissions.vercel.app` and adds two native things:

- **Screenshot blocking on modules and quizzes**. `js/app-bridge.js` turns
  on the PrivacyScreen plugin (Android `FLAG_SECURE`) while a module
  (material) or quiz is open and off otherwise, so students can still
  screenshot errors for the teacher. While it's on, screenshots and screen
  recordings come out black.
- **Native Google sign-in**. Google blocks its web sign-in button inside
  apps, so the app's account picker gets the ID token and the page signs in
  with it.

Site updates show up in the app right away. Only changes to native parts need
a new APK.

The static site stays build-free. This folder has its own npm setup and is
built only by `.github/workflows/android-apk.yml`. Vercel ignores it
(`.vercelignore`).

## One-time setup (teacher/admin)

1. **Create a signing key** (keep it forever; losing it means students must
   uninstall and reinstall):
   ```bash
   keytool -genkeypair -v -keystore class-submissions.jks -alias classsubmissions -keyalg RSA -keysize 2048 -validity 10000
   ```
   Print its SHA-1 (needed in step 2):
   ```bash
   keytool -list -v -keystore class-submissions.jks -alias classsubmissions
   ```
2. **Firebase Console**. Go to project `simple-lms-40950`, then
   Project settings, then **Add app → Android**:
   - Package name: `com.classsubmissions.app`
   - SHA-1: from step 1
   - Download `google-services.json` and save it as
     `android-app/google-services.json`, then commit it. It's not secret.
3. **GitHub → repo Settings → Secrets and variables → Actions**. Add:
   - `ANDROID_KEYSTORE_BASE64`: the output of `base64 -w0 class-submissions.jks`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`: `classsubmissions`
   - `ANDROID_KEY_PASSWORD`
4. **Release**. Push a tag:
   ```bash
   git tag app-v1.0.0 && git push origin app-v1.0.0
   ```
   CI builds and signs `class-submissions.apk`, then publishes it as the
   latest GitHub Release. That's the file the site's "Download the app"
   button links to.

## Installing (students)

On an Android phone, tap **Download the app** (or open the Release page).
Open `class-submissions.apk`, allow "install unknown apps" if asked, then
tap **Install**. Sign in with the same Gmail.

## Limits

- Native Google sign-in needs Google Play Services. On phones without it
  (Huawei, or Play Services off/outdated) it fails ("getCredentialAsync no
  provider dependencies found"), and the sign-in page opens **"Use an email
  link"**: the student emails themselves a Firebase sign-in link, long-presses
  it, Copy link, and pastes it into the app (tapping it would open the browser
  instead). Website-side, no APK change.
- Android only. iPhones keep the web anti-cheat (question bank, watermark,
  breach counting). iOS can't block screenshots for web content.
- No split screen or pop-up view: the app sets `resizeableActivity="false"`,
  which phones honor (Android 12+ ignores it on tablets/foldables, where the
  web quiz's split-screen pause still hides the questions).
- The "app required" check runs in the student's browser, so it deters but
  can be spoofed, like the rest of the quiz anti-cheat.
