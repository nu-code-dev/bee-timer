# Configuration reference

BEE Timer stores its settings in a single `config.json`. The main process loads it at startup, **sanitizes and clamps every value**, and writes it back atomically (temp file + rename) whenever the renderer saves. You can edit it by hand while the app is closed, or just use the Settings screen — both end up in the same file.

## Location

The path comes from Electron's `app.getPath('userData')`, which uses the app name `BEE Timer`:

| OS | Path |
| --- | --- |
| Linux | `~/.config/BEE Timer/config.json` |
| Windows | `%APPDATA%\BEE Timer\config.json` |
| macOS | `~/Library/Application Support/BEE Timer/config.json` |

If the file is missing, unreadable, or invalid JSON, the app logs a warning and starts from the built-in defaults (nothing is lost except your edits). If it exists, it is always rewritten in canonical form on the next save: unknown keys are dropped, wrong types are replaced with defaults, and out-of-range numbers are clamped.

## Schema

### Top level

| Key | Type | Default | Range / allowed | Meaning |
| --- | --- | --- | --- | --- |
| `schemaVersion` | number | `1` | always written as `1` | Format version. Informational; the app does not migrate older versions. |
| `onboarded` | boolean | `false` | `true` / `false` | Whether the setup wizard has been completed. `false` shows the wizard instead of the timer on launch. |
| `durationMs` | number | `600000` (10:00) | 5000 – 86400000 | Total countdown length in milliseconds. |
| `tickBaseMs` | number | `1000` | always `1000` | Base length of one game second. Fixed — speed distortion multiplies it at runtime. |
| `maxRemainingMs` | number | `86400000` (24h) | always 24h | Upper cap for remaining time. Doubling and additions can never exceed this. Fixed. |
| `midRunSettings` | boolean | `true` | `true` / `false` | Allow opening Settings while the countdown is running. When `false`, the gear button is disabled during an active run. |
| `notifyAllEvents` | boolean | `false` | `true` / `false` | Send a desktop notification for **every** chaos event (in-app toast included), not just bee puns. Needs a notification daemon; see [HYPRLAND.md](HYPRLAND.md#notifications). |
| `features` | object | see below | — | Per-feature toggles and odds. |
| `appearance` | object | see below | — | Visual options. |
| `window` | object | see below | — | Window state. |

### `features`

Every feature object has `enabled` (boolean) and `chancePct` (number, 0–100, the probability **per tick**). Feature-specific keys are listed below.

| Key | Default `enabled` | Default `chancePct` | Extra keys (default / range) | Effect |
| --- | --- | --- | --- | --- |
| `addSecond` | `true` | `5` | — | Adds 1 second (clamped by `maxRemainingMs`). |
| `addMinute` | `true` | `1` | — | Adds 60 seconds (clamped by `maxRemainingMs`). |
| `doubleTime` | `true` | `1` | — | Doubles remaining time, capped at 24h. |
| `freeze` | `true` | `5` | `cycles`: `5` (1–60) | Pauses the countdown for N ticks. |
| `formatChaos` | `true` | `5` | `swapMinSec`: `true`; `roundNearestMinute`: `true`; `durationTicks`: `3` (1–60) | Display-only chaos for N ticks: swap minutes/seconds or round to the nearest minute. Never changes real remaining time. |
| `speedDistortion` | `true` | `10` | `multipliers`: `[0.5, 2]` (only 0.5 and 2 are valid); `durationTicks`: `4` (1–60) | Scales the real length of the next N ticks. 0.5× = 2s real per game second; 2× = 0.5s real. |
| `windowChaos` | `false` | `1` | `marginPx`: `40` (0–400) | Randomly moves the window within the current monitor's work area. Hidden under "Advanced · danger zone". |
| `originalBeeMode` | `false` | `1` | `durationMs`: `4000` (500–30000) | Synthesized bee buzz + swarm overlay for the given duration. |
| `beePuns` | `true` | `1` | — | Desktop notification with a bee pun (in-app toast always shown too). |
| `restMode` | `true` | `0.5` | `restMs`: `180000` (5000–3600000); `cooldownMs`: `300000` (0–3600000) | Starts a skippable rest during which the countdown pauses. Cannot retrigger while resting or during cooldown. |

### `appearance`

| Key | Type | Default | Range / allowed | Meaning |
| --- | --- | --- | --- | --- |
| `theme` | string | `"dark"` | `"dark"` or `"light"` | Theme id. `"dark"` is the default dark-honey look; `"light"` is the cream/honey light theme (Settings → App → **Light mode**). Old configs containing `"honey"` are migrated to `"dark"`. |
| `reducedMotion` | boolean | `false` | `true` / `false` | Calms animations (bee swarm, shake, pulses). |
| `opacity` | number | `0.97` | 0.6 – 1.0 | Window-level opacity. |

### `window`

| Key | Type | Default | Range / allowed | Meaning |
| --- | --- | --- | --- | --- |
| `alwaysOnTop` | boolean | `true` | `true` / `false` | Pin the widget above other windows (`setAlwaysOnTop(true, 'screen-saver')`). Mirrors the 📌 button. |
| `x` | number or `null` | `null` | any finite integer | Saved left position. `null` = place near the top-right of the primary display. |
| `y` | number or `null` | `null` | any finite integer | Saved top position. `null` = same default placement. |
| `width` | number | `392` | 360 – 900 | Restored window width (the widget mode itself uses 400×320). |
| `height` | number | `250` | 220 – 1200 | Restored window height. |

> **Note:** `x`/`y` are read at startup, but the app does not currently write them back when you drag the window. To lock a position, use a compositor rule (see [HYPRLAND.md](HYPRLAND.md)) or set `x`/`y` by hand while the app is closed.

## Example `config.json`

```json
{
  "schemaVersion": 1,
  "onboarded": true,
  "durationMs": 600000,
  "tickBaseMs": 1000,
  "maxRemainingMs": 86400000,
  "midRunSettings": true,
  "notifyAllEvents": false,
  "features": {
    "addSecond":       { "enabled": true,  "chancePct": 5 },
    "addMinute":       { "enabled": true,  "chancePct": 1 },
    "doubleTime":      { "enabled": true,  "chancePct": 1 },
    "freeze":          { "enabled": true,  "chancePct": 5, "cycles": 5 },
    "formatChaos":     { "enabled": true,  "chancePct": 5, "swapMinSec": true, "roundNearestMinute": true, "durationTicks": 3 },
    "speedDistortion": { "enabled": true,  "chancePct": 10, "multipliers": [0.5, 2], "durationTicks": 4 },
    "windowChaos":     { "enabled": false, "chancePct": 1, "marginPx": 40 },
    "originalBeeMode": { "enabled": false, "chancePct": 1, "durationMs": 4000 },
    "beePuns":         { "enabled": true,  "chancePct": 1 },
    "restMode":        { "enabled": true,  "chancePct": 0.5, "restMs": 180000, "cooldownMs": 300000 }
  },
  "appearance": {
    "theme": "dark",
    "reducedMotion": false,
    "opacity": 0.97
  },
  "window": {
    "alwaysOnTop": true,
    "x": null,
    "y": null,
    "width": 392,
    "height": 250
  }
}
```

## Semantics

- **Sanitized on load.** Missing keys take defaults; wrong types are ignored (the default wins); numbers are clamped to the ranges above and rounded where noted. You can't brick the app with a bad `config.json` — worst case you get defaults plus a console warning.
- **Sanitized on save.** The renderer sends a patch to the main process via IPC (`config:save`); the main process deep-merges known sub-objects (`features`, `appearance`, `window`), re-sanitizes, and writes atomically. Unknown keys are discarded.
- **Mid-run edits apply immediately** (when `midRunSettings` is `true`): changes are pushed into the running engine, so raising a chance or disabling a feature takes effect on the next tick. The duration (`durationMs`) is only applied on the next run/reset; the engine keeps its current remaining time.
- **Reset defaults** in Settings restores feature blocks, `midRunSettings`, `notifyAllEvents`, `appearance.theme`, `reducedMotion`, and `alwaysOnTop` — it does not change `onboarded` or `durationMs`.
- **Run state is not persisted.** Closing or relaunching the app does not save the remaining time, tick count, freeze/rest state, or statistics. A fresh launch shows the full configured duration, paused, and the button reads **Start**; press it (or Space) to begin.
- **Theme migration.** Configs written before 0.1.2 stored `appearance.theme` as `"honey"` (or omitted it). That is read as the default `"dark"` and rewritten as `"dark"` on the next save; use `"light"` for the cream/honey light mode. Toggling **Light mode** in Settings → App writes this key.
- **`notifyAllEvents` is about the OS notification only.** Chaos events are already surfaced in the app; when this key is `true`, each one is also sent to the system notification daemon (plus an in-app toast). It needs a running daemon (mako/dunst/swaync/fnott/…) — otherwise there is nothing to display, just like bee puns. Check **Settings → Setup & integration** for daemon status.
- **`tickBaseMs`, `maxRemainingMs`, and `schemaVersion` are effectively fixed.** Editing them has no effect; the sanitizer writes the canonical values back.
- **`chancePct` is per tick, not per run.** At 1% and one tick per second, an effect fires on roughly 1 in 100 ticks.
