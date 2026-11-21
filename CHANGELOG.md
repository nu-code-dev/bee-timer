# Changelog

All notable changes to BEE Timer are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `packaging/arch/`: bumped `bee-timer-bin` to 0.1.4 with the verified release
  AppImage checksum; regenerated `.SRCINFO`.

## [0.1.4] - 2026-11-21

### Added

- **Swarms** settings group with two toggles, both on by default: **Rare Swarms**
  (0.05%, blessed or demonic, ×5 of every good/bad effect, full-screen theme) and
  **Common Swarms** (0.1%, happy or angry, ×1 of every effect, themed popup).
  Compact mode shows a background tint + small label instead of the full overlay.
- **Compact mode** (▭): collapses the window to just the countdown; encouraging
  messages and swarm themes keep working.
- **Editable starting duration** via the click-to-edit label above the countdown
  (only before the timer runs; disabled while running or paused).
- **Stop button**: while paused, Reset turns into Stop (resets without restarting).
- Hyprland compositor-side resize fallback so wizard/settings/compact window
  sizes actually apply on Wayland.

### Changed

- **Reduce motion** now also hides the seconds count bar (it can flicker at high
  tick speeds), and the description says so.
- Fixed the settings "right side glitches out of frame" repaint issue with a
  forced compositor repaint after window resizes.
- **AUR package** synced to the published release with the verified AppImage
  checksum; `.SRCINFO` regenerated.

## [0.1.3] - 2026-11-21

### Added

- **Halve Time** chaos effect (cuts the remaining time in half).
- **Distorting Chaos**: makes Speed Distortion permanent and compounding. Only
  available while Speed Distortion is on; when enabled, Speed Distortion's chance
  and duration are ignored and Distorting Chaos's own chance (default 1%) is used.
- **Configurable Speed Distortion duration** (ticks input in Settings).
- Supportive BEE messages (the old "pun" notifications are now kind, encouraging
  messages), with clearer framing as a study/work timer feature.
- Small reset quip under the controls; status chips moved next to the controls.

### Changed

- Chaos-control descriptions no longer hard-code percentages (the value is
  editable right next to each toggle); chance arrows now step by 0.5%.
- Settings separates "Chaos controls" from "Advanced · don't touch"; the wizard
  advanced section is renamed accordingly.
- Chaos log entries animate in smoothly only when new instead of re-rendering
  every tick.
- Window teleport now works on Hyprland via `hyprctl eval` + `hl.dsp.window.move`
  when the compositor ignores normal window moves.
- Light mode scrollbars are more visible; reduced-motion description is clearer.
- **AUR package** synced to the published release with the verified AppImage
  checksum; `.SRCINFO` regenerated.

## [0.1.2] - 2026-11-21

### Added

- **Light mode** — _Settings → App → Light mode_ switches the default dark-honey
  theme to a cream/honey light theme. Persisted as `appearance.theme`
  (`"dark"` default, `"light"`); old `"honey"` values migrate to `"dark"`.
- **Notify on every chaos event** — _Settings → App_ toggle, config key
  `notifyAllEvents` (boolean, default `false`). When on, every chaos event
  (+1s, +1m, double, freeze, formatting, speed, window teleport, rest start/end,
  Original BEE mode, end of timer) is sent as a desktop notification alongside
  the in-app toast. Bee puns already notify by default. Needs a notification daemon.
- **Settings → Setup & integration screen** — detects a running notification
  daemon (mako/dunst/swaync/fnott/etc., or "none detected") with install/start
  hints, shows copyable Hyprland window-rule snippets (Lua primary, legacy
  `hyprland.conf` fallback), lists installed paths (launcher, unpacked app dir,
  desktop entry, config), and provides the uninstall command.
- **`install.sh` prompts** — interactive setup prompts (default **No**, read from
  `/dev/tty` so `curl | bash` works): install `mako` on Arch when no notification
  daemon is running, and append BEE Timer window rules to the detected Hyprland
  config (Lua `hl.window_rule` when `hyprland.lua` exists, legacy
  `windowrulev2` when only `hyprland.conf` exists) with a backup, duplicate-rule
  skip, and `hyprctl reload`. `BEE_TIMER_YES=1` accepts both for unattended
  installs; `--uninstall` removes the rule block the installer added.

### Changed

- Docs now treat Hyprland's Lua config (`hyprland.lua`, `hl.window_rule`) as the
  primary window-rule path, with `hyprland.conf` (`windowrulev2` / hybrid
  `windowrule`) documented as the legacy fallback; README and download guidance
  updated for the 0.1.2 artifacts.
- `packaging/arch/`: bumped `bee-timer-bin` to 0.1.1 with the verified AppImage
  checksum from the published release; regenerated `.SRCINFO`.

## [0.1.1] - 2026-11-21

### Added

- `install.sh`: optional one-line, no-sudo Linux installer. Downloads the latest
  release AppImage, extracts it (no FUSE 2 required) into `~/.local/opt/bee-timer/`,
  adds a `bee-timer` command and a desktop entry + icon for the application menu.
  Supports `BEE_TIMER_PREFIX`, `BEE_TIMER_VERSION`, and `--uninstall`.
- Windows and macOS artifacts are now attached to the release by CI.

### Changed

- Repositioned the project as a **study/work timer** that fights procrastination
  and stretches focus sessions; added a "Why it works as a study / work timer"
  section to the README.
- AUR: `bee-timer-bin` is submission-ready, but new AUR account registration is
  currently blocked, so the README now states it is not published and points to
  the installer / AppImage / `.deb` instead.

## [0.1.0] - 2026-11-21

Initial release. A floating, frameless, always-on-top bee-themed countdown timer
that sabotages you, inspired by DougDoug's chaotic countdown timer.

### Added

- **Frameless, transparent, always-on-top widget** with a draggable titlebar and
  pin/minimize/quit controls. Always-on-top uses `setAlwaysOnTop(true, 'screen-saver')`.
- **Onboarding wizard** with duration presets (1/5/10/30 min, default 10:00) and a
  custom duration field (5 seconds to 24 hours), plus an "Advanced · danger zone"
  section for the chaotic features.
- **Chaos engine** (`src/renderer/engine.js`) with per-tick probabilistic effects:
  - ⏱️ +1 Second — 5% per tick, on by default
  - 😈 +1 Minute — 1% per tick, on by default
  - ✖️ Double Time — 1% per tick, on by default, capped at 24h remaining
  - ❄️ Freeze Timer — 5% per tick, freezes the countdown for 5 cycles, on by default
  - 🔀 Formatting Chaos — 5% per tick, display-only min/sec swap or rounding, on by default
  - 🌀 Speed Distortion — 10% per tick, 0.5× or 2× tick length for 4 ticks, on by default
  - 💬 BEE Pun Notifications — 1% per tick, ~60 puns, desktop notification with in-app toast fallback, on by default
  - 🧘 Rest Mode — 0.5% per tick, 3-minute skippable pause with cooldown, on by default
  - 🐝 Original BEE Mode — 1% per tick, off by default: synthesized WebAudio bee buzz + swarm overlay
  - 🪟 Window Teleport — 1% per tick, off by default, hidden under "Advanced · danger zone"
- **Settings screen** usable mid-run (toggleable via "Mid-run settings"), with per-feature
  enable switches, editable per-tick percentages, always-on-top, reduced motion, and reset defaults.
- **Live timer UI**: pulse meter showing the current real tick length, status chips for
  freeze/rest/speed/pause, rolling chaos log, rest overlay with countdown and skip button,
  and an end-of-run stats screen with "Run it back".
- **Synthesized audio** (no bundled assets): bee buzz and completion/rest chimes via WebAudio.
- **Keyboard controls**: Space to pause/start on the timer screen, Escape to close settings.
- **Config persistence** at the platform userData path (`~/.config/BEE Timer/config.json` on Linux),
  sanitized and clamped on load, written atomically.
- **Linux/Hyprland support**: XWayland forced by default when `$DISPLAY` exists for reliable
  always-on-top, `BEE_TIMER_OZONE=wayland` override, `--class=bee-timer`, and documented
  Hyprland float/size/pin window rules for both `windowrulev2` and newer `windowrule` syntax.
- **Packaging**: electron-builder config for Linux AppImage + deb, Windows NSIS, and macOS dmg;
  `npm run dist:dir` unpacked smoke build; dependency-free icon generator (`npm run icon`).
- **Docs and automation**: README, MIT license, Hyprland/config/architecture guides, AUR
  `bee-timer-bin` PKGBUILD + desktop entry + Hyprland snippet, CI (tests + unpacked build),
  and a tag-triggered release workflow uploading artifacts to GitHub Releases.
- **Tests**: 14 deterministic chaos-engine tests via `node --test`, including seeded statistical
  validation of the 1% minute odds over 10,000 ticks.

### Notes

- Windows and macOS builds are unsigned: SmartScreen and Gatekeeper warnings are expected.
- Timer state is not persisted across relaunches; a fresh launch shows the full duration, paused.
