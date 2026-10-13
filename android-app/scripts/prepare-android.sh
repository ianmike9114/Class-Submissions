#!/usr/bin/env bash
# Generates the native android/ project fresh on every CI build (so the repo
# only holds config, not thousands of generated Gradle files), then applies
# the few customizations the app needs. Run from android-app/.
set -euo pipefail

if [ ! -f google-services.json ] && [ "${ALLOW_DUMMY_GOOGLE_SERVICES:-}" = "1" ]; then
  # PR check builds only: prove the Gradle build works before the real
  # Firebase Android app exists. Never used for a released APK.
  echo '{"project_info":{"project_number":"0","project_id":"dummy"},"client":[{"client_info":{"mobilesdk_app_id":"1:0:android:0","android_client_info":{"package_name":"com.classsubmissions.app"}},"oauth_client":[],"api_key":[{"current_key":"dummy"}]}],"configuration_version":"1"}' > google-services.json
  echo "::warning::Using a dummy google-services.json (PR build check only)."
fi
if [ ! -f google-services.json ]; then
  echo "::error::android-app/google-services.json is missing. Firebase Console -> Project settings -> Add app -> Android (package com.classsubmissions.app) -> download it and commit it here (it's not secret)."
  exit 1
fi

rm -rf android
npx cap add android

# Native Google sign-in for @capacitor-firebase/authentication.
sed -i 's/^ext {/ext {\n    rgcfaIncludeGoogle = true/' android/variables.gradle

# Firebase config for the Android app (google-services plugin is applied
# automatically by Capacitor's template when this file exists).
cp google-services.json android/app/google-services.json

# Version: CI passes APP_VERSION_NAME (from the tag) and APP_VERSION_CODE (run number).
if [ -n "${APP_VERSION_CODE:-}" ]; then
  sed -i "s/versionCode 1/versionCode ${APP_VERSION_CODE}/" android/app/build.gradle
fi
if [ -n "${APP_VERSION_NAME:-}" ]; then
  sed -i "s/versionName \"1.0\"/versionName \"${APP_VERSION_NAME#app-v}\"/" android/app/build.gradle
fi

# App icon from the site's PWA icon.
mkdir -p assets
cp ../icons/icon-512.png assets/icon-only.png
npx capacitor-assets generate --android --iconBackgroundColor '#002045' --splashBackgroundColor '#002045'

npx cap sync android
