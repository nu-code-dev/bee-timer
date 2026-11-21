#!/usr/bin/env bash
# BEE Timer — one-line Linux installer.
#
#   curl -fsSL https://raw.githubusercontent.com/nu-code-dev/bee-timer/main/install.sh | bash
#
# What it does (no sudo, everything stays in ~/.local):
#   1. downloads the latest release AppImage from GitHub Releases
#   2. extracts it (so FUSE 2 is NOT required) to ~/.local/opt/bee-timer/app
#   3. adds a `bee-timer` command on ~/.local/bin
#   4. adds "BEE Timer" to your application menu (desktop entry + icon)
#
# Options / environment:
#   --uninstall             remove the app, launcher, desktop entry and icon
#   --help                  show this help
#   BEE_TIMER_PREFIX=...    install prefix (default: $HOME/.local)
#   BEE_TIMER_VERSION=0.1.0 pin a specific release (default: latest)
#   BEE_TIMER_REPO=...      override the GitHub repo
#
# This script is optional: the AUR package, AppImage, .deb and building from
# source are all still supported.
set -euo pipefail

REPO="${BEE_TIMER_REPO:-nu-code-dev/bee-timer}"
PREFIX="${BEE_TIMER_PREFIX:-$HOME/.local}"
VERSION="${BEE_TIMER_VERSION:-latest}"
OPT_DIR="$PREFIX/opt/bee-timer"
BIN_LINK="$PREFIX/bin/bee-timer"
DESKTOP="$PREFIX/share/applications/bee-timer.desktop"
ICON="$PREFIX/share/icons/hicolor/512x512/apps/bee-timer.png"

YELLOW=$'\033[1;33m'
RED=$'\033[1;31m'
DIM=$'\033[2m'
RESET=$'\033[0m'
say() { printf '%s🐝 %s%s\n' "$YELLOW" "$*" "$RESET"; }
warn() { printf '%s!  %s%s\n' "$RED" "$*" "$RESET" >&2; }
die() {
  warn "$*"
  exit 1
}

usage() {
  sed -n '2,22p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//' || cat <<'EOF'
BEE Timer installer: curl -fsSL https://raw.githubusercontent.com/nu-code-dev/bee-timer/main/install.sh | bash
Use --uninstall to remove it, or set BEE_TIMER_PREFIX / BEE_TIMER_VERSION.
EOF
}

case "${1:-}" in
  --help | -h)
    usage
    exit 0
    ;;
  --uninstall)
    say "Removing BEE Timer from $PREFIX"
    rm -rf "$OPT_DIR" "$BIN_LINK" "$DESKTOP" "$ICON"
    if command -v update-desktop-database >/dev/null 2>&1; then
      update-desktop-database "$PREFIX/share/applications" >/dev/null 2>&1 || true
    fi
    say "Done. Your config at ~/.config/BEE Timer was left untouched."
    exit 0
    ;;
  '') ;;
  *)
    warn "Unknown option: $1"
    usage
    exit 1
    ;;
esac

# --- requirements -----------------------------------------------------------
[ "$(uname -s)" = "Linux" ] || die "This installer supports Linux only (Windows/macOS: use the release builds)."
case "$(uname -m)" in
  x86_64 | amd64) ;;
  *) die "Unsupported architecture '$(uname -m)'. Only x86_64 Linux builds are published." ;;
esac

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL --retry 2 --connect-timeout 20 "$1"; }
  download() { curl -fL --retry 2 --connect-timeout 20 --progress-bar -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -qO- --timeout=20 "$1"; }
  download() { wget -q --show-progress -O "$2" "$1"; }
else
  die "Need curl or wget to download BEE Timer."
fi

# --- resolve release asset --------------------------------------------------
if [ "$VERSION" = "latest" ]; then
  say "Finding the latest BEE Timer release…"
  URL="$(fetch "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -oE "https://[^\"]+/bee-timer-[0-9][^\"/]*-x86_64\.AppImage" \
    | head -n1 || true)"
  [ -n "$URL" ] || die "Could not find an AppImage in the latest release of $REPO. Use BEE_TIMER_VERSION=<version> or download manually."
else
  VERSION="${VERSION#v}"
  URL="https://github.com/$REPO/releases/download/v$VERSION/bee-timer-$VERSION-x86_64.AppImage"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
APPIMAGE="$TMP_DIR/bee-timer.AppImage"

say "Downloading $(basename "$URL")…"
download "$URL" "$APPIMAGE" || die "Download failed: $URL"
chmod +x "$APPIMAGE"

# Extract instead of mounting: the AppImage runtime's --appimage-extract does
# not need FUSE, so the installed app works on systems without fuse2.
say "Extracting (no FUSE required)…"
( cd "$TMP_DIR" && "$APPIMAGE" --appimage-extract >/dev/null 2>&1 ) || die "AppImage extraction failed."
[ -x "$TMP_DIR/squashfs-root/AppRun" ] || die "Unexpected AppImage layout (no AppRun)."

# --- install ----------------------------------------------------------------
mkdir -p "$OPT_DIR" "$PREFIX/bin" "$(dirname "$DESKTOP")" "$(dirname "$ICON")"
rm -rf "$OPT_DIR/app"
mv "$TMP_DIR/squashfs-root" "$OPT_DIR/app"

cat > "$BIN_LINK" <<LAUNCHER
#!/bin/sh
# BEE Timer launcher (installed by install.sh).
# BEE_TIMER_OZONE=wayland forces native Wayland; unset means auto (XWayland
# when \$DISPLAY is set, which is what gives always-on-top on Hyprland).
export BEE_TIMER_OZONE="\${BEE_TIMER_OZONE:-}"
exec "$OPT_DIR/app/AppRun" "\$@"
LAUNCHER
chmod 755 "$BIN_LINK"

ICON_SRC="$(find "$OPT_DIR/app/usr/share/icons" -type f -name 'bee-timer.png' 2>/dev/null | head -n1 || true)"
if [ -n "$ICON_SRC" ]; then
  cp "$ICON_SRC" "$ICON"
else
  fetch "https://raw.githubusercontent.com/$REPO/main/build/icon.png" > "$ICON" || warn "Could not fetch an icon; the app menu entry will use a generic icon."
fi

cat > "$DESKTOP" <<DESKTOP_ENTRY
[Desktop Entry]
Type=Application
Name=BEE Timer
GenericName=Countdown Timer
Comment=Chaotic study/work countdown timer that fights procrastination
Exec="$BIN_LINK"
Icon=bee-timer
Terminal=false
Categories=Utility;Timer;
Keywords=timer;countdown;study;work;pomodoro;focus;break;bees;
StartupWMClass=bee-timer
DESKTOP_ENTRY
chmod 644 "$DESKTOP"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$PREFIX/share/applications" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f "$PREFIX/share/icons/hicolor" >/dev/null 2>&1 || true
fi

say "Installed $(basename "$URL" .AppImage)"
say "Run it:  bee-timer      (or open “BEE Timer” from your app menu)"
printf '%sFiles: %s %s %s%s\n' "$DIM" "$BIN_LINK" "$OPT_DIR/app" "$DESKTOP" "$RESET"

case ":$PATH:" in
  *":$PREFIX/bin:"*) ;;
  *) warn "$PREFIX/bin is not on your PATH. Add this to your shell rc:  export PATH=\"$PREFIX/bin:\$PATH\"" ;;
esac

cat <<'TIP'
Tip (Hyprland): tiles new windows, so add this to ~/.config/hypr/hyprland.conf
then run `hyprctl reload`:

  windowrulev2 = float,class:^(bee-timer)$
  windowrulev2 = size 400 320,class:^(bee-timer)$
  windowrulev2 = pin,class:^(bee-timer)$

(On Hyprland 0.53+ try `windowrule = float, class:^(bee-timer)$` instead; see docs/HYPRLAND.md.)
Notifications need mako/dunst; audio is synthesized via WebAudio.
Uninstall anytime: curl -fsSL https://raw.githubusercontent.com/nu-code-dev/bee-timer/main/install.sh | bash -s -- --uninstall
TIP
