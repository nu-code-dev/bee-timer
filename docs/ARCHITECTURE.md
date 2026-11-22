# Architecture

BEE Timer is a small Electron app: a deliberately dumb main process, a locked-down preload bridge, and a vanilla ES-module renderer that contains all the chaos. No bundler, no framework, no runtime dependencies beyond Electron itself (dev-only). This document describes how the pieces fit together.

## Process split

```
┌─────────────────────────────── main process (Node) ───────────────────────────────┐
│ src/main/main.js         BrowserWindow, position/size modes, always-on-top,        │
│                          IPC handlers, notifications, single-instance lock          │
│ src/main/config-store.js defaults, sanitization/clamping, atomic JSON persistence  │
└──────────────────────────────────────┬────────────────────────────────────────────┘
                                       │ contextBridge (src/main/preload.js)
                                       │ window.bee
┌──────────────────────────────────────┴────────────────────────────────────────────┐
│ renderer (sandboxed web page, no Node)                                            │
│ src/renderer/engine.js   pure chaos engine (injectable rng/schedule/now)          │
│ src/renderer/app.js      screens, rendering, effects, WebAudio synthesis          │
│ src/renderer/features.js feature metadata (order, labels, advanced flag)          │
│ src/renderer/puns.js     ~60 supportive messages (legacy filename)                  │
│ src/renderer/index.html  wizard / widget / settings markup                        │
│ src/renderer/styles.css  honey-themed frameless styling                            │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### Main process (`src/main/main.js`)

- Applies the Linux windowing strategy before `whenReady`: `--class=bee-timer` and `--ozone-platform-hint=x11|wayland` based on `$DISPLAY` / `BEE_TIMER_OZONE` (see [HYPRLAND.md](HYPRLAND.md)).
- Takes a **single-instance lock**; a second launch focuses the existing window.
- Creates one frameless, transparent, always-on-top `BrowserWindow` (`minWidth` 360, `minHeight` 220, non-maximizable, non-fullscreenable) and restores position from config or defaults to top-right of the primary display.
- Serves three UI sizes through `setMode`: `wizard` 660×880 (centered), `widget` 400×320, `settings` 480×740.
- Applies `setAlwaysOnTop(value, 'screen-saver')` — the high level makes it float above fullscreen-ish windows where the compositor allows.
- Opens `http(s)` links externally and denies all in-app popups (`setWindowOpenHandler`).
- Owns notifications, quit/minimize, and config load/save.

### Preload (`src/main/preload.js`)

A minimal `contextBridge` surface named `window.bee`. Nothing else is exposed to the page:

| `window.bee` member | Channel | Returns |
| --- | --- | --- |
| `config.get()` | `config:get` | sanitized config object |
| `config.save(patch)` | `config:save` | sanitized saved config |
| `config.defaults()` | `config:defaults` | frozen `DEFAULTS` object |
| `window.setMode(mode)` | `window:set-mode` | `{ width, height }` |
| `window.setAlwaysOnTop(value)` | `window:set-always-on-top` | actual boolean state |
| `window.chaosMove(marginPx)` | `window:chaos-move` | `{ x, y }` or `null` |
| `notify(title, body)` | `notify:show` | `true` if a notification was shown |
| `app.quit()` | `app:quit` | — |
| `app.minimize()` | `app:minimize` | — |
| `app.version()` | `app:version` | app version string |

`config:save` is a **patch merge** in the main process: top-level keys are shallow-merged, `features`/`appearance`/`window` are deep-merged one level, then the result is re-sanitized before writing. The renderer therefore never writes raw JSON itself.

### Renderer (`src/renderer/app.js`)

Drives three screens (`wizard`, `timer`, `settings`), owns the engine instance, and translates engine effects into UI behavior:

| Engine effect | Renderer action |
| --- | --- |
| `add-second`, `add-minute`, `double`, `freeze`, `format`, `speed`, `end` | rendered from the next snapshot / overlays |
| `pun` (support message) | in-app toast + `notify:show` |
| `swarm` | themed in-app popup + full-screen theme (rare) or background tint (compact) + `notify:show` |
| `bees` | `playBuzz()` + bee/🍯 swarm overlay + screen shake |
| `window` | `window.chaosMove(marginPx)` |
| `rest-start` | `playChime(true)` |
| `rest-end` | hide rest overlay via snapshot |

`window.__BEE_DEBUG__` exposes read-only getters (`engine`, `config`, `snapshot`) for local smoke tests; it is not used by the UI.

## Chaos engine (`src/renderer/engine.js`)

`BeeEngine` is plain ESM with **zero Electron imports**, which lets the Node test runner exercise it directly.

### Deterministic by construction

The constructor accepts injected dependencies:

| Option | Default | Purpose |
| --- | --- | --- |
| `rng` | `Math.random` | all probability rolls and choice picks |
| `schedule(fn, delay)` | `setTimeout` | tick scheduling |
| `cancel(handle)` | `clearTimeout` | pause/reset/destroy |
| `now()` | `Date.now()` | timestamps for logs and pulse animation |
| `onChange(snapshot)` | no-op | UI render callback |
| `onEffect(effect)` | no-op | side-effect stream (support messages, buzz, window moves) |

Tests use `mulberry32(seed)` for a reproducible stream plus a fake timer queue, so every behavior — including a 10,000-tick statistical assertion on the 1% minute odds — is deterministic.

### Tick loop

1. `start()` schedules the first tick after `nextTickDelay()`.
2. Each tick first handles rest mode (decrement `rest.remainingMs` by one real second; no countdown, no chaos), then cooldown, then freeze (decrement `freezeTicks`, no countdown, no chaos).
3. Otherwise: `tick++`, `remainingMs -= 1000`, then `applyRandomChaos()`.
4. If remaining hits zero: emit `end`, stop scheduling, mark `ended`.
5. Re-schedule only if still `running && !paused`.

Freeze and rest do **not** increment the game tick, so they genuinely stall the clock; the pulse meter keeps animating and speed multipliers resume afterward. Cooldown is decremented on active ticks even while frozen (the decrement happens before the freeze branch), but not during rest.

### Fixed effect evaluation order

Effects are rolled once per active tick in a fixed order, which is what makes replay/determinism possible:

`addSecond → addMinute → doubleTime → halveTime → freeze → formatChaos → (distortingChaos | speedDistortion) → windowChaos → originalBeeMode → beePuns → rollSwarms → restMode`

Each roll is `rng() * 100 < chancePct` and is skipped entirely when `enabled` is false. Multipliers are additional rolls (format choice, speed choice, message draw). Distorting Chaos replaces the normal speed distortion roll entirely while it is enabled, and compounds the multiplier permanently (uncapped by tick time, clamped to 0.125×–16×).

### Key invariants

- **24-hour cap.** `maxRemainingMs` (default 24h) clamps every addition and doubling via `Math.min`. It is itself at least `config.durationMs`.
- **Formatting chaos.** Both options are *real* mutations: `swap` trades the minute/second values (`13:56 → 56:13`) and the clock counts down normally afterwards (hours↔minutes when an hours display is present); `round` snaps remaining time to the nearest minute, then counting resumes. `formatRemaining(ms)` is pure; `snapshot()` exposes `display` and `rawDisplay` for tests/debugging.
- **Speed distortion scales the real tick.** `speedMult` is 0.5 or 2 while `tick < speedState.untilTick`; `nextTickDelay()` = `round(1000 * mult)`. Distorting Chaos sets `untilTick = Infinity` and compounds the multiplier on each trigger. The displayed seconds counter still advances by one per tick.
- **Freeze** = N canceled countdowns; **rest** = a real-time pause (default 3 min) that can be skipped; after either, rest has a cooldown (default 5 min) during which it cannot retrigger.
- **Swarms** are resolved before rest mode: rare swarms apply ×5 of every good/bad effect, common swarms ×1. Blessed/happy swarms halve the remaining time and clear freeze/format/speed; demonic/angry swarms add time, freeze, scramble formatting and distort speed. The rare variants drive a full-screen themed overlay (or background tint + toast in compact mode).
- **Supportive messages** are drawn from a shuffled bag and reshuffled when empty, so all ~60 appear before any repeats (the config key remains `beePuns` for backwards compatibility).
- `reset()` restores duration, stats, logs, freeze/speed/format/rest/cooldown state; `updateConfig()` swaps in new settings and re-caps `maxRemainingMs` without resetting progress.

## Audio

No audio assets are shipped. `app.js` synthesizes everything with WebAudio:

- **Buzz:** `sawtooth` oscillator at 186 Hz, frequency-modulated by a 7.5 Hz vibrato (depth 26), amplitude-modulated by a 13 Hz tremolo, through a 1500 Hz lowpass, with a short attack and exponential release. Duration comes from `originalBeeMode.durationMs`.
- **Chime:** stacked sine notes at 523.25 / 659.25 / 783.99 Hz (two notes for the gentle rest chime), 140 ms apart, with exponential gain envelopes.
- Audio is unlocked on user gestures (Start, Pause, rest) to satisfy autoplay policy; failures are caught and logged, never fatal.

## Security posture

- `contextIsolation: true`, `nodeIntegration: false`, a minimal `contextBridge` API — the page cannot reach Node, `require`, or the filesystem.
- Strict CSP in `index.html`: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'`. Scripts load only from local files; no remote code, no eval, no network requests.
- All external navigation is blocked; `http(s)` links are handed to the OS browser.
- Config is untrusted input: main-process sanitization clamps ranges, drops unknown keys, and forces fixed constants. Writes are atomic.
- `sandbox: false` is set on the window (Electron's OS-level renderer sandbox is not enabled); the mitigation is that no remote content is ever loaded and the preload API is tiny. Enabling the sandbox is future hardening work.
- The app makes no network calls at all; there is no telemetry.

## Known limitations

- **Run state is not persisted.** Relaunch shows the full duration, paused; the current remaining time, stats, freeze/rest state, and logs are lost.
- **Window position is read but not re-saved** after dragging; `window.x`/`window.y` stay at their previous values (use compositor rules to pin placement).
- **Always-on-top on native Wayland is compositor-dependent**; the default XWayland path exists precisely because Wayland has no toplevel always-on-top protocol.
- **Formatting chaos is cosmetic**, by design; screenshots of a swapped clock are not evidence of time travel.
- **Notifications rely on a daemon** on Linux; the in-app toast is the reliable fallback.
- **Unsigned Windows/macOS builds**, no auto-updater, no tray icon, single window only, one theme (`honey`), English only.
- Builds are per-OS: Windows/macOS artifacts must be built on those platforms (the release workflow handles this).
