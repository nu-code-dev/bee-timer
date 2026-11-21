#!/usr/bin/env bash
# BEE Timer — one-line Linux installer.
#
#   curl -fsSL https://raw.githubusercontent.com/nu-code-dev/bee-timer/main/install.sh | bash
#
# What it does (no sudo needed for the app itself — everything lives in ~/.local):
#   1. downloads the latest release AppImage from GitHub Releases
#   2. extracts it (so FUSE 2 is NOT required) to ~/.local/opt/bee-timer/app
#   3. adds a `bee-timer` command on ~/.local/bin
#   4. adds "BEE Timer" to your application menu (desktop entry + icon)
#   5. optionally offers to install a notification daemon (mako on Arch) so bee
#      puns and chaos notifications show up as real desktop notifications
#   6. optionally offers to add floating / always-on-top window rules to your
#      Hyprland config (Lua hyprland.lua on current Hyprland, hyprland.conf on
#      older setups) and reloads Hyprland — with a backup first
#
# Options / environment:
#   --uninstall             remove the app, launcher, menu entry, icon and the
#                           BEE Timer Hyprland rule block (settings are kept)
#   --yes                   answer Yes to the optional prompts (non-interactive)
#   --help                  show this help
#   BEE_TIMER_PREFIX=...    install prefix (default: $HOME/.local)
#   BEE_TIMER_VERSION=0.1.3 pin a specific release (default: latest)
#   BEE_TIMER_REPO=...      override the GitHub repo
#   BEE_TIMER_YES=1         same as --yes
#
# Prompts only appear when a terminal is attached; in scripts/Piped installs they
# default to No and the commands are printed instead.
#
# Everything here is optional: AUR, AppImage, .deb and building from source are
# all still supported. The same help is available inside the app under
# Settings → Setup & integration.
set -euo pipefail

REPO="${BEE_TIMER_REPO:-nu-code-dev/bee-timer}"
PREFIX="${BEE_TIMER_PREFIX:-$HOME/.local}"
VERSION="${BEE_TIMER_VERSION:-latest}"
OPT_DIR="$PREFIX/opt/bee-timer"
BIN_LINK="$PREFIX/bin/bee-timer"
DESKTOP="$PREFIX/share/applications/bee-timer.desktop"
ICON="$PREFIX/share/icons/hicolor/512x512/apps/bee-timer.png"
HYPR_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/hypr"
HYPR_LUA="$HYPR_DIR/hyprland.lua"
HYPR_CONF="$HYPR_DIR/hyprland.conf"

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

[ "${BEE_TIMER_YES:-0}" = "1" ] && YES_DEFAULT=1 || YES_DEFAULT=0

usage() {
  sed -n '2,32p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//' || cat <<'EOF'
Usage: install.sh [--yes] [--uninstall]
  curl -fsSL https://raw.githubusercontent.com/nu-code-dev/bee-timer/main/install.sh | bash
Environment: BEE_TIMER_PREFIX, BEE_TIMER_VERSION, BEE_TIMER_YES, BEE_TIMER_REPO.
EOF
}

# Ask a yes/no question. Returns 0 for yes. Reads/writes the controlling
# terminal so `curl | bash` works; defaults to No when no terminal is attached.
ask_yes_no() {
  local prompt="$1"
  if [ "${YES_DEFAULT}" = "1" ]; then
    say "$prompt → yes (BEE_TIMER_YES=1)"
    return 0
  fi
  if [ ! -r /dev/tty ]; then
    return 1
  fi
  local answer=""
  printf '%s [y/N] ' "$prompt" >/dev/tty
  IFS= read -r answer </dev/tty || return 1
  case "$answer" in
    y | Y | yes | YES | Yes) return 0 ;;
    *) return 1 ;;
  esac
}

detect_notifier() {
  local running
  running="$(ps -eo comm= 2>/dev/null | tr '[:upper:]' '[:lower:]')" || return 1
  printf '%s\n' "$running" | grep -Exq 'mako|dunst|swaync|fnott|notify-osd|xfce4-notifyd|gnome-shell|plasmashell' || return 1
  printf '%s\n' "$running" | grep -Exo 'mako|dunst|swaync|fnott|notify-osd|xfce4-notifyd|gnome-shell|plasmashell' | head -n1
}

hypr_target() {
  if [ -f "$HYPR_LUA" ]; then
    printf '%s' "$HYPR_LUA"
  elif [ -f "$HYPR_CONF" ]; then
    printf '%s' "$HYPR_CONF"
  fi
}

rules_present() {
  [ -n "$1" ] && [ -f "$1" ] && grep -q 'BEE Timer window rules (added by installer)' "$1"
}

append_hypr_rules() {
  local target="$1"
  local backup="${target}.bee-timer.bak"
  cp "$target" "$backup"
  case "$target" in
    *.lua)
      cat >>"$target" <<'LUA_RULES'

-- BEE Timer window rules (added by installer)
-- Keep the widget floating, sized, and on top on every workspace.
hl.window_rule({
    match = { class = "bee-timer" },
    float = true,
    size = "400 320",
    pin = true,
})
-- end BEE Timer window rules
LUA_RULES
      ;;
    *)
      cat >>"$target" <<'CONF_RULES'

# BEE Timer window rules (added by installer)
windowrulev2 = float,class:^(bee-timer)$
windowrulev2 = size 400 320,class:^(bee-timer)$
windowrulev2 = pin,class:^(bee-timer)$
# end BEE Timer window rules
CONF_RULES
      ;;
  esac
  say "Added BEE Timer rules to $target (backup: $backup)"
}

remove_hypr_rules() {
  local target="$1"
  [ -n "$target" ] && [ -f "$target" ] || return 0
  grep -q 'BEE Timer window rules (added by installer)' "$target" || return 0
  local backup="${target}.bee-timer.bak"
  cp "$target" "$backup"
  awk '
    /BEE Timer window rules \(added by installer\)/ { skip = 1 }
    !skip { print }
    /end BEE Timer window rules/ { skip = 0 }
  ' "$target" >"${target}.bee-timer.tmp"
  mv "${target}.bee-timer.tmp" "$target"
  say "Removed the BEE Timer rule block from $target (backup: $backup)"
}

reload_hyprland() {
  if command -v hyprctl >/dev/null 2>&1 && [ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]; then
    if hyprctl reload >/dev/null 2>&1; then
      say "Hyprland config reloaded."
    else
      warn "Could not reload Hyprland automatically. Restart Hyprland or run: hyprctl reload"
    fi
  fi
}

print_hypr_help() {
  local target
  target="$(hypr_target)"
  cat <<EOF

$(printf '%s' "$DIM")To make the widget float and stay on top, add this to your Hyprland
config$( [ -n "$target" ] && printf ' (%s)' "$target" ), then reload Hyprland:
$(printf '%s' "$RESET")
  -- Hyprland 0.57+ (Lua, hyprland.lua)
  hl.window_rule({
      match = { class = "bee-timer" },
      float = true,
      size = "400 320",
      pin = true,
  })

  # Older Hyprland (hyprland.conf)
  windowrulev2 = float,class:^(bee-timer)\$
  windowrulev2 = size 400 320,class:^(bee-timer)\$
  windowrulev2 = pin,class:^(bee-timer)\$

After adding it: hyprctl reload
(If your dotfiles generate that config, put the rule in your user override file.)
EOF
}

print_notify_help() {
  cat <<EOF

$(printf '%s' "$DIM")No notification daemon detected, so desktop notifications are dropped.
Bee puns still appear as in-app toasts. Install and start one:

  Arch:    sudo pacman -S --needed mako && mako &
  Debian:  sudo apt install dunst && dunst &
  Fedora:  sudo dnf install dunst && dunst &

(mako, dunst, swaync and fnott all work. Add it to your compositor
autostart so it starts with your session.)$(printf '%s' "$RESET")
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
    remove_hypr_rules "$HYPR_LUA"
    remove_hypr_rules "$HYPR_CONF"
    reload_hyprland
    if command -v update-desktop-database >/dev/null 2>&1; then
      update-desktop-database "$PREFIX/share/applications" >/dev/null 2>&1 || true
    fi
    say "Done. Your config at ~/.config/BEE Timer was left untouched."
    exit 0
    ;;
  --yes)
    YES_DEFAULT=1
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
(cd "$TMP_DIR" && "$APPIMAGE" --appimage-extract >/dev/null 2>&1) || die "AppImage extraction failed."
[ -x "$TMP_DIR/squashfs-root/AppRun" ] || die "Unexpected AppImage layout (no AppRun)."

# --- install ----------------------------------------------------------------
mkdir -p "$OPT_DIR" "$PREFIX/bin" "$(dirname "$DESKTOP")" "$(dirname "$ICON")"
rm -rf "$OPT_DIR/app"
mv "$TMP_DIR/squashfs-root" "$OPT_DIR/app"

cat >"$BIN_LINK" <<LAUNCHER
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
  fetch "https://raw.githubusercontent.com/$REPO/main/build/icon.png" >"$ICON" || warn "Could not fetch an icon; the app menu entry will use a generic icon."
fi

cat >"$DESKTOP" <<DESKTOP_ENTRY
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

# --- optional: notification daemon ------------------------------------------
NOTIFIER="$(detect_notifier || true)"
if [ -n "$NOTIFIER" ]; then
  say "Notification daemon detected: $NOTIFIER"
else
  if command -v pacman >/dev/null 2>&1; then
    if ask_yes_no "No notification daemon running. Install mako and start it? (sudo pacman -S --needed mako)"; then
      if sudo pacman -S --needed --noconfirm mako; then
        if command -v mako >/dev/null 2>&1; then
          (setsid mako >/dev/null 2>&1 &) || true
          sleep 1
          if [ -n "$(detect_notifier || true)" ]; then
            say "mako installed and running. Add 'mako' to your compositor autostart for future sessions."
          else
            warn "mako is installed but not running yet. Start it with: mako &"
          fi
        fi
      else
        warn "Could not install mako. Install it manually: sudo pacman -S --needed mako"
      fi
    else
      print_notify_help
      warn "You can also enable the in-app fallback notifications any time; see Settings → Setup & integration."
    fi
  else
    print_notify_help
  fi
fi

# --- optional: Hyprland window rules ---------------------------------------
if command -v Hyprland >/dev/null 2>&1 || command -v hyprctl >/dev/null 2>&1 || [ -d "$HYPR_DIR" ]; then
  TARGET="$(hypr_target)"
  if rules_present "$TARGET"; then
    say "BEE Timer Hyprland rules already present in $TARGET — leaving it alone."
  elif [ -n "$TARGET" ]; then
    if ask_yes_no "Add floating / always-on-top rules to $TARGET? (backup is kept)"; then
      append_hypr_rules "$TARGET"
      reload_hyprland
    else
      print_hypr_help
      warn "No changes made to $TARGET. Add the block there whenever you're ready (or after your dotfiles update on startup)."
    fi
  else
    print_hypr_help
    warn "No Hyprland config found to edit — add the block to your config on startup."
  fi
fi

# --- done -------------------------------------------------------------------
printf '%sFiles: %s %s %s%s\n' "$DIM" "$BIN_LINK" "$OPT_DIR/app" "$DESKTOP" "$RESET"

case ":$PATH:" in
  *":$PREFIX/bin:"*) ;;
  *) warn "$PREFIX/bin is not on your PATH. Add this to your shell rc:  export PATH=\"$PREFIX/bin:\$PATH\"" ;;
esac

cat <<'TIP'

Everything above is also inside the app: Settings (⚙️) → Setup & integration,
including notification status, Hyprland Lua/config snippets you can copy, and
installed file paths.

- Toggle chaotic desktop notifications: Settings → App → "Notify on every chaos event".
- Chatty bees? Disable individual effects with their per-tick odds in Settings.
- Uninstall anytime:
    curl -fsSL https://raw.githubusercontent.com/nu-code-dev/bee-timer/main/install.sh | bash -s -- --uninstall
  (removes the app, launcher, menu entry, icon and the BEE Timer Hyprland rule block)
TIP
