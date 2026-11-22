#!/usr/bin/env bash
set -euo pipefail

# ReactiveCircus runs action's script under /bin/sh. Enter bash explicitly
# for pipefail and fail-fast behavior without changing global runner settings.
npm run web:prepare
npx cap add android
npx cap sync android
node scripts/prepare-android-archive-download.mjs
node scripts/patch-android-gradle.mjs
node scripts/prepare-p0-emulator-build.mjs
(
  cd android
  chmod +x gradlew
  ./gradlew assembleDebug
)
bash -n scripts/android-emulator-smoke.sh
bash scripts/android-emulator-smoke.sh android/app/build/outputs/apk/debug/app-debug.apk
