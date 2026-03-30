# Summon

A Quake-style dropdown terminal extension for GNOME Shell (45-49). Toggle a terminal with a single keystroke -- it slides down from the top of your screen and disappears when you're done.

Works with any terminal emulator. Automatically detects what you have installed, or pick one explicitly. Designed for power users who live in the terminal.

## Demo

https://github.com/GentleGhostCoder/summon-gnome-extension/raw/main/demo.mp4

## Why This Extension Exists

There are existing dropdown terminal solutions for GNOME -- ddterm, Guake, Yakuake, built-in terminal emulator drop-down modes. None of them got the full picture right. This extension was built to fill that gap.

**Speed.** Most dropdown extensions embed their own terminal widget or spawn a heavyweight wrapper. This extension does neither. It launches your actual terminal emulator -- the same one you've already configured and optimized -- and manages it as a window. Startup is instant because there's no extra layer. Alacritty with GPU rendering, Kitty with its image protocol, Foot with its Wayland-native speed -- you get the real thing, not a compatibility shim.

**Flexibility.** Guake and ddterm lock you into their built-in VTE terminal. Want to use Alacritty? Kitty? Ghostty? You can't. This extension works with any terminal that supports setting a WM class. Pair it with tmux for persistent sessions, run it with a custom shell, pass arbitrary arguments -- it stays out of your way.

**Compatibility.** Existing solutions break across GNOME versions. An extension written for GNOME 43 often dies on GNOME 45 because Mutter APIs change constantly (`get_maximized()` became `get_maximize_flags()`, `set_skip_taskbar()` became read-only on Wayland, `maximize()` lost its arguments). This extension detects the API at runtime and adapts, supporting GNOME 45 through 49 with a single codebase.

**Window, workspace, and focus handling -- done right.** This is the core differentiator. No other dropdown terminal does all of this:

- **Follow mouse across monitors.** The terminal appears on whichever monitor your cursor is on. Not whichever monitor it was last on. Not the primary monitor. The one you're actually looking at.
- **Smart context switch.** When the terminal is visible on monitor A and you press the shortcut on monitor B, it *moves* to monitor B instead of hiding. Other extensions force you to toggle twice -- hide, then show -- losing your flow.
- **Workspace-aware.** The terminal follows you across workspaces. It doesn't get stranded on workspace 1 when you switch to workspace 3.
- **Correct focus management.** When the terminal slides in, it takes focus. When it slides out, focus returns cleanly. No ghost focus, no stuck keyboard input, no fighting with the window manager.
- **Keybinding isolation.** The extension automatically detects and resolves conflicts with IBus input method shortcuts and GNOME keybindings that would otherwise swallow your shortcut or leak key events to other windows.

Existing solutions get one or two of these right. None get all of them. This extension was built because the author needed all of them every day, across two monitors, with tmux sessions, and got tired of working around the gaps.

## Features

- **Any terminal emulator** -- Alacritty, Kitty, Foot, Wezterm, Ghostty, Ptyxis, GNOME Terminal, Konsole, Tilix, Xfce4 Terminal, or any custom command
- **Auto-detection** -- finds the best available terminal on your system without configuration
- **Startup command** -- launch directly into tmux, zsh, or any command
- **Slide animation** -- smooth drop-down/retract animation with configurable duration
- **Multi-monitor** -- follows your mouse cursor across monitors, or pin to a specific one
- **Smart context switch** -- pressing the shortcut on a different monitor moves the terminal there instead of hiding it
- **Always on top** -- stays above your other windows
- **Hidden from taskbar** -- doesn't clutter Alt+Tab or your dock
- **Auto-hide on focus loss** -- optionally hides when you click elsewhere
- **Fullscreen mode** -- maximize to fill the entire work area
- **Configurable size and position** -- width/height as percentage, top or bottom of screen
- **Keybinding conflict resolution** -- automatically removes IBus/input-source conflicts

## Installation

### From extensions.gnome.org (recommended)

Visit [Summon on extensions.gnome.org](https://extensions.gnome.org/extension/XXXX/summon/) and toggle it on.

### Manual install

```bash
git clone https://github.com/GentleGhostCoder/summon-gnome-extension.git
cd summon
make install
```

Then restart GNOME Shell (log out/in on Wayland) and enable:

```bash
gnome-extensions enable summon@semjon-geist.de
```

## Recommended Setup

This is the author's daily-driver configuration -- a fast, beautiful dropdown terminal with persistent sessions.

### Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Terminal | [Alacritty](https://alacritty.org/) | GPU-accelerated, minimal, fast startup |
| Multiplexer | [tmux](https://github.com/tmux/tmux) | Persistent sessions, splits, survives crashes |
| Shell | [Zsh](https://www.zsh.org/) + [Oh My Zsh](https://ohmyz.sh/) | Completions, plugins, themes |
| Theme | [Dracula](https://draculatheme.com/) | Consistent dark theme across all tools |

### Alacritty config (`~/.config/alacritty/alacritty.toml`)

```toml
import = ["~/.config/alacritty/dracula.toml"]

[terminal.shell]
program = "/usr/bin/zsh"

[env]
TERM = "xterm-256color"

[window]
decorations = "none"
opacity = 0.8
```

Get the Dracula theme: [draculatheme.com/alacritty](https://draculatheme.com/alacritty)

### tmux config (`~/.tmux.conf`)

```bash
# Plugin manager
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'dracula/tmux'
set -g @plugin 'tmux-plugins/tmux-resurrect'

# Terminal settings
set -g default-terminal "tmux-256color"
set-option -g default-shell /usr/bin/zsh
set -g mouse on
set -g history-limit 30000
set -s escape-time 50

# Navigation
bind -n C-left  previous-window
bind -n C-right next-window

# Initialize TPM (keep at bottom)
run '~/.tmux/plugins/tpm/tpm'
```

Install TPM: `git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm`, then press `prefix + I` inside tmux to install plugins.

### Extension settings

Open preferences with:

```bash
gnome-extensions prefs summon@semjon-geist.de
```

Recommended configuration:

| Setting | Value | Notes |
|---------|-------|-------|
| Terminal | `auto` or `alacritty` | Auto-detects the best available |
| Startup Command | `tmux new-session -A -s main` | Attaches to existing session or creates one |
| Width | `100%` | Full width |
| Height | `100%` | Full height |
| Position | `top` | Classic dropdown style |
| Animation | `0` | Disabled (instant) |
| Follow Mouse | On | Terminal appears on the active monitor |
| Smart Context Switch | On | Moves terminal between monitors instead of hiding |
| Always on Top | Off | Behaves like a normal window when not focused |
| Hide from Taskbar | On | Clean Alt+Tab, no dock entry |
| Shortcut | `Ctrl+Space` | Default shortcut (change in Shortcut tab) |

### Zsh + Oh My Zsh

```bash
# Install Oh My Zsh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

In `~/.zshrc`, set your theme:

```bash
ZSH_THEME="blinks"
```

## Configuration Reference

All settings are accessible via the preferences UI or `dconf`:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `terminal` | string | `auto` | Terminal emulator: `auto`, a specific name, or a custom command |
| `terminal-args` | string | `""` | Extra arguments passed to the terminal |
| `startup-command` | string | `""` | Command to run inside the terminal on launch |
| `toggle-dropdown` | string[] | `['<Control>Return']` | Keyboard shortcut |
| `width-percent` | int | `100` | Width as percentage of monitor (10-100) |
| `height-percent` | int | `50` | Height as percentage of monitor (10-100) |
| `position` | string | `top` | `top` or `bottom` |
| `monitor` | string | `current` | `current`, `primary`, or monitor index (`0`, `1`, ...) |
| `fullscreen` | bool | `false` | Maximize to fill entire work area |
| `animation-duration` | int | `0` | Slide animation in ms (0 to disable) |
| `follow-mouse` | bool | `true` | Terminal appears on the monitor with the mouse |
| `smart-context-switch` | bool | `true` | Move terminal to current monitor instead of hiding |
| `always-on-top` | bool | `false` | Keep above other windows |
| `auto-hide-on-focus-loss` | bool | `false` | Hide when another window gains focus |
| `hide-from-taskbar` | bool | `true` | Hide from Alt+Tab and dock |
| `remove-keybinding-conflicts` | bool | `true` | Auto-remove IBus/input-source conflicts |

### Custom terminal

When using a custom command, you must include the WM class flag so the extension can identify its window:

```
my-terminal --class summon
```

The exact flag varies by terminal (`--class`, `--app-id`, `--name`). Check your terminal's documentation.

## Supported GNOME Versions

- GNOME Shell 45
- GNOME Shell 46
- GNOME Shell 47
- GNOME Shell 48
- GNOME Shell 49

## License

GPL-2.0-or-later
