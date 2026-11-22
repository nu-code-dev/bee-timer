# BEE Timer on Hyprland

BEE Timer is a frameless, transparent, **always-on-top** floating widget. That combination is exactly what Wayland does not standardize, so this guide explains how the app copes and how to make it behave on Hyprland (tested against **Hyprland 0.57** on Arch Linux).

> TL;DR: keep the default XWayland mode, add a float/size/pin window rule to your Hyprland config — `~/.config/hypr/hyprland.lua` on current Hyprland (0.57+), or `hyprland.conf` on legacy setups — then run `hyprctl reload`. Rules added at runtime with `hyprctl keyword` did not work on 0.57.

## XWayland vs native Wayland

| | Default (XWayland) | Native Wayland |
| --- | --- | --- |
| Always-on-top | Works: Hyprland honors `_NET_WM_STATE_ABOVE` for XWayland clients | No toplevel protocol; relies on compositor rules and may not stick |
| Transparency / rounded corners | Works via compositor | Works, but behavior varies |
| Window class | `bee-timer` | `bee-timer` |
| How to select | Automatic when `$DISPLAY` is set | `BEE_TIMER_OZONE=wayland` |

On startup the main process runs roughly:

```js
app.commandLine.appendSwitch('class', 'bee-timer');
const ozoneHint = process.env.BEE_TIMER_OZONE || (process.env.DISPLAY ? 'x11' : 'wayland');
app.commandLine.appendSwitch('ozone-platform-hint', ozoneHint === 'wayland' ? 'wayland' : 'x11');
```

So if you are on a normal Hyprland session with XWayland enabled (the default), the app starts as an XWayland client automatically. To force native Wayland:

```bash
BEE_TIMER_OZONE=wayland bee-timer
# or for the AppImage:
BEE_TIMER_OZONE=wayland ./bee-timer-0.1.9-x86_64.AppImage
```

Any value other than `wayland` is treated as X11. The AUR wrapper passes `BEE_TIMER_OZONE` through, so you can export it from your shell or set it in the `.desktop` `Exec=` line. XWayland must be enabled in your Hyprland config:

```ini
xwayland {
    enabled = true
}
```

Verify you have XWayland: `hyprctl version` shows the Hyprland version, and `echo $DISPLAY` should print something like `:0` in a session where XWayland is running.

## Window rules

Hyprland tiles new windows by default, which would squash a 400×320 widget into a tile. Add rules so the window floats, has a sane size, and is pinned across workspaces.

### Lua config (current Hyprland, 0.57+ — primary)

Hyprland 0.57 uses a **Lua** configuration. The main file is usually `~/.config/hypr/hyprland.lua`, often split via `require()` into modules. Put this block in the main file, or in a rules module that the main file requires:

```lua
hl.window_rule({
    match = { class = "bee-timer" },
    float = true,
    size = "400 320",
    pin = true,
})
```

Then reload: **`hyprctl reload`**. Window rules are applied when a window opens, so **restart BEE Timer** as well (a reload alone won't retroactively float an already-open window).

> **Dotfiles / framework caution:** if your config is generated or managed by a dotfiles/framework setup (Caelestia, KooL dots, etc.), put the rule in your **user-overrides file** rather than the generated main config. Config managers may rewrite their generated files and drop your block.

### Legacy `hyprland.conf` (fallback)

Older Hyprland versions — or a config you have kept in `.conf` form — use the classic rule syntax. Pick the form that matches your release:

```ini
# Hyprland ≤ 0.52 (windowrulev2 syntax)
windowrulev2 = float,class:^(bee-timer)$
windowrulev2 = size 400 320,class:^(bee-timer)$
windowrulev2 = pin,class:^(bee-timer)$
windowrulev2 = stayfocused,class:^(bee-timer)$
```

```ini
# Hyprland 0.53+ hybrid syntax (`windowrule` with a space after the comma)
windowrule = float, class:^(bee-timer)$
windowrule = size 400 320, class:^(bee-timer)$
windowrule = pin, class:^(bee-timer)$
windowrule = stay_focused, class:^(bee-timer)$
```

Put these in `~/.config/hypr/hyprland.conf` (or a file it `source`s) and run **`hyprctl reload`**, then restart BEE Timer.

> **Version caveat:** syntax differs between Hyprland releases, and on 0.57 the runtime dispatcher is gone: *both* `hyprctl keyword windowrulev2 …` and `hyprctl keyword windowrule …` returned `unknown request`. Always check `hyprctl version` first, edit the text of the config file, and reload. If one legacy form errors in your config, try the other.

### Let the installer configure it for you

`install.sh` detects Hyprland and offers to append the BEE Timer rules to your detected config file:

- uses the **Lua** block (`hl.window_rule`) when `~/.config/hypr/hyprland.lua` exists, and the legacy `windowrulev2` block when only `hyprland.conf` exists;
- backs the file up first and skips the write if the rules are already present;
- runs `hyprctl reload` if available.

When no notification daemon is running it also offers to install `mako` on Arch (other distros get package-manager advice) and starts it for the current session if accepted.

The prompt defaults to **No**. Decline and the installer prints the snippet to add yourself (for example in your compositor startup config, then reload). Both interactive and piped forms are supported:

```bash
# one-liner: prompts only when a terminal is attached
curl -fsSL https://raw.githubusercontent.com/nu-code-dev/bee-timer/main/install.sh | bash

# from a checkout of the repo
bash install.sh

# unattended: accept the prompt (no prompts without a TTY)
curl -fsSL https://raw.githubusercontent.com/nu-code-dev/bee-timer/main/install.sh | BEE_TIMER_YES=1 bash
```

`install.sh --uninstall` removes the BEE Timer rule block it added, leaving your other settings and the app config untouched.

The same snippet is available inside the app under **Settings → Setup & integration** with a copy button, and ships as [`packaging/arch/hyprland.conf.snippet`](../packaging/arch/hyprland.conf.snippet).

### Notes on the rules

- `float` keeps the widget out of the tiling layout.
- `size 400 320` matches the app's default widget mode. The window is resizable, so you can pick your own size.
- `pin` makes the window visible on **all workspaces** — usually what you want for a stream timer. Remove it if you'd rather keep the timer on one workspace.
- `stayfocused` / `stay_focused` is optional and only exists in the legacy `.conf` forms. It forces keyboard focus, which can be annoying; Space-to-pause only works while the widget has focus. Omit it if it steals focus from your game/editor.
- Rules match on the window class, which is `bee-timer` (set via `--class=bee-timer`). Confirm with `hyprctl clients`.

### Where rules go

- **Current Hyprland (Lua):** `~/.config/hypr/hyprland.lua`, or a module it `require()`s. If you maintain a user-overrides file, use that.
- **Legacy `.conf`:** `~/.config/hypr/hyprland.conf`, or a file it sources, for example:

  ```ini
  # ~/.config/hypr/hyprland.conf
  source = ~/.config/hypr/windowrules.conf
  ```

Then put the rules in `windowrules.conf`. Avoid editing Hyprland's autogenerated config from a settings GUI — it may be rewritten.

## Positioning and multi-monitor

- With no saved position, the app places itself near the **top-right of the primary display** (24px margin), then Hyprland's float rules take over.
- To place it explicitly on a legacy `.conf` config, add a move rule inside the float rule set:

  ```ini
  # old syntax
  windowrulev2 = move 1500 40,class:^(bee-timer)$
  # hybrid syntax
  windowrule = move 1500 40, class:^(bee-timer)$
  ```

  Coordinates are absolute in the compositor's layout, so pick values for the monitor you want. `move` is shown in `.conf` form here because it wasn't part of the verified Lua snippet; on a Lua config, use your Hyprland version's Lua rule keys or just drag the window. The app does not fight you for position.
- Multi-monitor: drag the widget to the target monitor; `pin` keeps it visible on every workspace but it stays on the monitor you placed it on. Use `hyprctl monitors` to get monitor names/geometry, `hyprctl clients` to see where the window is.
- Window Teleport (off by default) moves the widget within its current monitor's work area. If it annoys you, leave the feature off.

## Notifications

Supportive bee messages try a real desktop notification first, then always show an in-app toast. Since 0.1.2, **Settings → App → Notify on every chaos event** extends that to every event (+1s, +1m, double, freeze, formatting, speed, window teleport, rest start/end, Original BEE mode, and end of timer). Both features need a notification daemon, or the OS-level part is silently dropped:

```bash
# check for a running daemon (mako, dunst, swaync, fnott, …)
pgrep -a -f 'mako|dunst|swaync|fnott'

# install one (Arch)
sudo pacman -S mako          # alternatives: dunst, swaync, fnott

# start it for this session
mako &
notify-send "test" "does this show up?"
```

Add the daemon to your compositor autostart so it starts with the session — on legacy `.conf` configs that is `exec-once = mako` in `hyprland.conf`; on a Lua config, add it to your startup/autostart setup. If `notify-send` works but BEE Timer notifications don't appear, check the daemon's logs or DND mode.

In-app status: **Settings → Setup & integration** shows whether a notification daemon was detected (mako/dunst/swaync/fnott/etc., or "none detected"), with install/start hints. Detection is best-effort — if your daemon isn't listed but `notify-send` works, treat the status as advisory. Without a daemon, notifications fall back to in-app toasts; the toast never depends on the daemon.

## Audio

All sounds (bee buzz, rest chime, end chime) are synthesized with the WebAudio API — no audio files, no codecs. They go through the system audio server:

- PipeWire (with `pipewire-pulse` or `wireplumber`) or PulseAudio is required.
- Check the server: `pactl info` should report a server name.
- Unmute the app if a stream rule muted it (`pavucontrol` → Playback → BEE Timer).
- Browsers/Electron only allow audio after a user gesture; the app unlocks audio on Start, Pause, or settings interaction, so pressing Start is enough.

## Troubleshooting

**The window is tiled / tiny / full-height.**
Your rule isn't matching. On current Hyprland, confirm the `hl.window_rule({ ... })` block is in `~/.config/hypr/hyprland.lua` (or a required module/user-overrides file), not only in a runtime command. Run `hyprctl clients`, find the BEE Timer window, and check its `class:` — it should be `bee-timer`. Class regexes are case-sensitive: `class:^(bee-timer)$`. Run `hyprctl reload` and **restart the app**; rules only apply on window open.

**It's floating but not on top of other windows.**
1. Check the pin button / *Always on top* setting in the app — if it's off, the app deliberately isn't on top.
2. Make sure you're in the default XWayland mode (unset `BEE_TIMER_OZONE`). Native Wayland has no always-on-top protocol; try the `stayfocused` rule (legacy `.conf`) or pin instead.
3. Check `_NET_WM_STATE` on the XWayland window (install `xorg-xprop`):
   ```bash
   hyprctl clients            # find the X11 window id
   xprop -id 0x... _NET_WM_STATE
   ```
   You want `_NET_WM_STATE_ABOVE` in the list. If it's missing even though the app says it's pinned, your compositor version may ignore it — please file an issue with `hyprctl version` output.
4. Some fullscreen games are simply a law unto themselves; pinning the widget to a second monitor usually wins.

**No transparency (black or grey box behind the widget).**
Transparency needs a compositor — Hyprland always has one, so this is usually a driver/config issue. Check that you haven't forced a non-composited setup, try toggling `decoration:blur` / `blur` rules, and try the other ozone mode (`BEE_TIMER_OZONE=wayland`) to see if behavior changes. Some proprietary NVIDIA + XWayland combinations render transparent Electron windows as black; native Wayland or a different driver setting may help.

**Wrong window class.**
The class is `bee-timer` via `--class=bee-timer`; verify with `hyprctl clients` and adjust your regex if a wrapper (e.g. an AppImage launcher script) changes it. The desktop entry sets `StartupWMClass=bee-timer` for taskbar grouping.

**`hyprctl keyword windowrule …` says "unknown request".**
Known on 0.57, and it is the wrong tool now: rules must be **edited in the config file** (`hl.window_rule` in `hyprland.lua`, or the legacy `.conf` forms), then `hyprctl reload`. This is a Hyprland runtime dispatcher limitation, not an app error.

**BEE Timer doesn't show up in the app menu.**
The installer writes `~/.local/share/applications/bee-timer.desktop` and an icon (exact paths are listed in **Settings → Setup & integration**). Check the file exists, ensure `~/.local/share` is in your menu's data path, and refresh the cache with `update-desktop-database ~/.local/share/applications`. A fresh login usually fixes a stale menu.

**No desktop notifications (or "none detected" in Settings).**
Install and start a daemon (`mako`, `dunst`, `swaync`, `fnott`, …), then test with `notify-send "hi" "bee test"`. Check the daemon is actually running (`pgrep -a mako`) and not in DND mode. In-app toasts keep working without it.

**No sound.**
Check `pactl info`, unmute BEE Timer in `pavucontrol`, and make sure PipeWire/PulseAudio is running. Audio starts after the first Start/Pause/settings interaction.

**AppImage won't launch.**
Electron AppImages need FUSE 2: `sudo pacman -S fuse2`. Alternatively use the one-line installer (`install.sh`, which extracts the AppImage and needs no FUSE), the `.deb`, or an unpacked build.

**Two timers?**
The app takes a single-instance lock; launching it again focuses the existing window instead of opening a second one.

## Quick reference

```bash
hyprctl version            # check rule syntax era
hyprctl clients            # confirm class=bee-timer, floating, position
hyprctl reload             # after editing hyprland.lua or hyprland.conf
hyprctl monitors           # monitor geometry for move rules
hyprctl dispatch focuswindow class:bee-timer
pgrep -a -f 'mako|dunst|swaync|fnott'   # is a notification daemon running?
notify-send "hi" "bee test"             # verify notification daemon
pactl info                 # verify PipeWire/PulseAudio

BEE_TIMER_OZONE=wayland bee-timer       # opt into native Wayland
```


## Window teleport on Hyprland

The **Window Teleport** chaos effect moves the widget by asking Hyprland over IPC
when the compositor ignores a client move request (Wayland has no toplevel move
protocol, and some tiling setups ignore `setBounds`). On Hyprland 0.57+ it uses
the Lua API via `hyprctl eval`, e.g.:

```lua
hl.dispatch(hl.dsp.window.move({ x = 1200, y = 500, relative = false, window = "class:bee-timer" }))
```

If teleport still does nothing, make sure the window class is `bee-timer`
(`hyprctl clients`) and your Hyprland window rules keep the widget floating.
