#!/usr/bin/env bash
set -euo pipefail

APK_PATH="${1:-android/app/build/outputs/apk/debug/app-debug.apk}"
ZIPALIGN="${ANDROID_HOME:-/usr/local/lib/android/sdk}/build-tools/36.0.0/zipalign"

if [[ ! -f "$APK_PATH" ]]; then
  echo "APK not found: $APK_PATH" >&2
  exit 1
fi
if [[ ! -x "$ZIPALIGN" ]]; then
  echo "zipalign not found: $ZIPALIGN" >&2
  exit 1
fi
command -v readelf >/dev/null || { echo "readelf is required (binutils)" >&2; exit 1; }
command -v unzip >/dev/null || { echo "unzip is required" >&2; exit 1; }

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
unzip -q "$APK_PATH" 'lib/*/*.so' -d "$TMP_DIR"

mapfile -t LIBRARIES < <(find "$TMP_DIR/lib" -type f -name '*.so' -print 2>/dev/null | sort)
if [[ ${#LIBRARIES[@]} -eq 0 ]]; then
  echo "No native .so libraries found in APK; expected bundled LiteRT JNI library." >&2
  exit 1
fi

for library in "${LIBRARIES[@]}"; do
  mapfile -t ALIGNMENTS < <(readelf -lW "$library" | awk '$1 == "LOAD" { print $NF }')
  if [[ ${#ALIGNMENTS[@]} -eq 0 ]]; then
    echo "No ELF LOAD segments found: $library" >&2
    exit 1
  fi
  for alignment in "${ALIGNMENTS[@]}"; do
    if [[ ! "$alignment" =~ ^0x[0-9a-fA-F]+$ ]]; then
      echo "Unrecognized ELF alignment '$alignment' in $library" >&2
      exit 1
    fi
    numeric_alignment=$((alignment))
    if (( numeric_alignment < 16384 )); then
      echo "FAIL: $library has PT_LOAD alignment $alignment (< 0x4000 / 16 KB)" >&2
      exit 1
    fi
  done
  echo "ELF 16-KB LOAD alignment OK: $library"
done

"$ZIPALIGN" -c -P 16 4 "$APK_PATH"
echo "APK ZIP alignment OK for 16-KB pages: $APK_PATH"
