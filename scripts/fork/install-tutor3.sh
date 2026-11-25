#!/bin/bash
# Installs Tutor3 from its .dmg on a Mac with Apple silicon.
#   curl -fsSL https://raw.githubusercontent.com/daleross18/tutor3code/main/scripts/fork/install-tutor3.sh | bash
#   bash install-tutor3.sh ~/Downloads/T3-Code-0.1.10-arm64.dmg
# With no path, it uses the newest .dmg in ~/Downloads that holds Tutor3.app. The build names
# the file like the stock app (T3-Code-<version>-arm64.dmg), so the script looks inside each.
set -euo pipefail

# One function, called on the last line: bash reads the whole script before it runs, so a
# command that reads stdin cannot eat the rest of a script piped from curl.
main() {

APP_NAME="Tutor3.app"
BUNDLE_ID="com.daleross.tutor3"
# Builds before 2026-11-23 had the internal name t3code-panes.
OLD_BUNDLE_ID="com.daleross.t3code-panes"
# TUTOR3_APPLICATIONS_DIR is for the test of this script only.
TARGET="${TUTOR3_APPLICATIONS_DIR:-/Applications}/$APP_NAME"
MOUNT=""

fail() { echo "Error: $*" >&2; exit 1; }
detach() { [ -n "$MOUNT" ] && hdiutil detach -quiet "$MOUNT" >/dev/null 2>&1 || true; }
trap 'detach; [ -n "$MOUNT" ] && rmdir "$MOUNT" 2>/dev/null || true' EXIT

[ "$(uname -s)" = "Darwin" ] || fail "this script runs on macOS only."
[ "$(uname -m)" = "arm64" ] || fail "this build is for a Mac with Apple silicon."

# Moves the data of a build with the old internal name (t3code-panes) to the new name (tutor3),
# one time. Nothing moves when the new name already exists.
move_once() {
  if [ -e "$1" ] && [ ! -e "$2" ]; then
    echo "Moving $1 to $2"
    mv "$1" "$2"
  elif [ -e "$1" ]; then
    echo "Note: $1 and $2 both exist. Tutor3 uses $2. $1 stays."
  fi
}

migrate_old_name() {
  move_once "$HOME/.t3-panes" "$HOME/.tutor3"
  move_once "$HOME/Library/Application Support/t3code-panes" "$HOME/Library/Application Support/tutor3"
  # The cookies of the browser profiles (claude.ai sign-ins) are encrypted with this password.
  if security find-generic-password -s "tutor3 Safe Storage" >/dev/null 2>&1; then return 0; fi
  local info account password
  info="$(security find-generic-password -s "t3code-panes Safe Storage" 2>/dev/null)" || return 0
  account="$(printf '%s\n' "$info" | sed -n 's/^ *"acct"<blob>="\(.*\)"$/\1/p' | head -1)"
  account="${account//t3code-panes/tutor3}"
  [ -n "$account" ] || account="tutor3"
  echo "Copying the Keychain password of the old build. macOS may ask for your login password."
  if password="$(security find-generic-password -s "t3code-panes Safe Storage" -w 2>/dev/null)" &&
    security add-generic-password -s "tutor3 Safe Storage" -a "$account" -w "$password" >/dev/null 2>&1; then
    return 0
  fi
  echo "Note: the Keychain password was not copied. Sign in to claude.ai again in Tutor3."
}

# Mounts $1 read-only at a new folder. Returns 0 if the image holds Tutor3.app.
mount_dmg() {
  MOUNT="$(mktemp -d /tmp/tutor3-dmg.XXXXXX)"
  if ! hdiutil attach -quiet -nobrowse -readonly -noautoopen -mountpoint "$MOUNT" "$1" >/dev/null 2>&1; then
    rmdir "$MOUNT"; MOUNT=""; return 1
  fi
  [ -d "$MOUNT/$APP_NAME" ] && return 0
  detach; rmdir "$MOUNT"; MOUNT=""; return 1
}

if [ $# -ge 1 ]; then
  [ -f "$1" ] || fail "no file at $1"
  mount_dmg "$1" || fail "$1 does not hold $APP_NAME."
  DMG="$1"
else
  DMG=""
  # Newest first. ls -t keeps this working with the bash 3.2 of macOS.
  while IFS= read -r candidate; do
    if mount_dmg "$candidate"; then DMG="$candidate"; break; fi
  done < <(ls -t "$HOME"/Downloads/*.dmg 2>/dev/null | head -10)
  [ -n "$DMG" ] || fail "no .dmg in ~/Downloads holds $APP_NAME. Download it first, or pass its path."
fi
echo "Installing from: $DMG"

# Quit only Tutor3, by bundle id (the old one too). The stock T3 Code app keeps running.
if pgrep -f "$TARGET/Contents/MacOS/" >/dev/null 2>&1; then
  echo "Quitting Tutor3..."
  osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
  osascript -e "tell application id \"$OLD_BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    pgrep -f "$TARGET/Contents/MacOS/" >/dev/null 2>&1 || break
    sleep 0.5
  done
  pgrep -f "$TARGET/Contents/MacOS/" >/dev/null 2>&1 && fail "Tutor3 is still running. Quit it and run this again."
fi

migrate_old_name
echo "Copying $APP_NAME to /Applications..."
rm -rf "$TARGET"
ditto "$MOUNT/$APP_NAME" "$TARGET"
detach

# The app has no Apple developer signature: remove the download mark and sign it locally.
xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true
codesign --force --deep --sign - "$TARGET" >/dev/null 2>&1 || fail "codesign failed. Run: codesign --force --deep --sign - $TARGET"

echo "Done. Threads, environments and settings stay in ~/.tutor3."
open "$TARGET"
}

main "$@"
