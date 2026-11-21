# Changelog

All notable changes to BEE Timer are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Repositioned the project as a **study/work timer** that fights procrastination and stretches focus sessions; added a "Why it works as a study / work timer" section to the README.
- `packaging/arch/`: made the `bee-timer-bin` PKGBUILD submission-ready — real AppImage checksum, generated `.SRCINFO`, and documented AUR publishing steps. The README no longer claims the package is already published to the AUR.

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
