# Contributing to BEE Timer

Thanks for poking the hive. Bug reports, puns, and well-scoped chaos ideas are all welcome.

## Dev setup

Requirements: Node.js 24+ and npm. You do **not** need to install any framework tooling.

```bash
git clone https://github.com/nu-code-dev/bee-timer.git
cd bee-timer
npm install
npm start        # run the app
npm test         # run the chaos-engine tests
```

If `npm install` finishes but `node_modules/electron/dist/electron` is missing, newer npm versions have blocked Electron's postinstall download. Run it manually:

```bash
XDG_CACHE_HOME=$PWD/.cache node node_modules/electron/install.js
```

Linux (especially Hyprland) window-rule setup: see [docs/HYPRLAND.md](docs/HYPRLAND.md). Config schema: [docs/CONFIG.md](docs/CONFIG.md). Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Code style

- **Vanilla ES modules.** No frameworks, no bundler, no build step. `src/renderer/*.js` are loaded directly as modules; main/preload are CommonJS.
- Match the existing style: 2-space indent, single quotes, semicolons, trailing commas in multiline literals. Keep the code comment style (why, not what).
- The chaos engine (`src/renderer/engine.js`) must stay **pure and free of Electron imports**: injectable `rng`/`schedule`/`now`, deterministic effect order, display-only formatting chaos. Don't mutate real remaining time for cosmetic effects.
- Keep `src/main/config-store.js` the source of truth for defaults; every user-editable value needs sanitization/clamping there.
- UI text is lowercase-friendly and playful; keep new copy in that voice.
- No new runtime dependencies without discussion — the app intentionally ships zero.

## Tests

- `npm test` runs `test/engine.test.mjs` with Node's built-in runner (14 tests).
- Every new engine behavior needs a deterministic test (seeded `mulberry32` or a scripted RNG, fake scheduler). No timing flakiness.
- If you touch packaging/config, a manual `npm run dist:dir` smoke build is appreciated.

## Pull requests

1. Keep changes focused; one concern per PR.
2. Describe what chaos you added/changed and how you tested it (OS, compositor, Electron version).
3. Run `npm test` and `npm run dist:dir` before opening the PR.
4. Update docs (`README.md`, `docs/CONFIG.md` for config keys) and `CHANGELOG.md` under **[Unreleased]** when behavior changes.
5. Don't modify `build/icon.png` by hand — regenerate it with `npm run icon`.
6. Do not commit `node_modules/`, `dist/`, logs, or local config.

## Reporting bugs

Include:

- OS/distro and compositor (e.g. Arch + Hyprland 0.57, Windows 11, macOS 15)
- Whether you're on XWayland or native Wayland (`echo $DISPLAY`, `BEE_TIMER_OZONE`)
- App version (`app.version()` or the About/release tag)
- Steps to reproduce, expected vs actual behavior
- The terminal output from `npm start` if it's a crash, and relevant `config.json` (redact what you like)
- Screenshots for visual/window-rule issues, plus `hyprctl version` and `hyprctl clients` output on Hyprland

Open an issue at <https://github.com/nu-code-dev/bee-timer/issues>. For security concerns, please don't open a public issue first — contact the maintainer via the address on the GitHub profile.
