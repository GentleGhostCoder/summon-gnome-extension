import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AltTab from 'resource:///org/gnome/shell/ui/altTab.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const WM_CLASS = 'summon';

// GNOME 45-48 backward compat: Meta.MaximizeFlags was removed in GNOME 49
const MAXIMIZE_BOTH = Meta.MaximizeFlags?.BOTH ?? 3;

export default class DropdownTerminalExtension extends Extension {
    _settings = null;
    _settingsChangedId = null;
    _terminalWindow = null;
    _windowCreatedId = null;
    _windowDestroyId = null;
    _focusWindowId = null;
    _keybindingId = 'toggle-dropdown';
    _enabled = false;
    _pendingTimeouts = [];
    _conflictsRemoved = [];
    _origGetWindows = null;
    _origGetWindowApp = null;
    _animating = false;

    enable() {
        try {
            this._enabled = true;
            this._settings = this.getSettings();
            this._removeConflictingBindings();
            this._bindShortcut();
            this._connectSignals();
            this._findExistingWindow();
            this._settingsChangedId = this._settings.connect('changed', (_, key) => {
                this._onSettingChanged(key);
            });
        } catch (e) {
            console.error(`[Summon] enable() error: ${e.message}`);
        }
    }

    disable() {
        try {
            this._enabled = false;

            for (const id of this._pendingTimeouts) {
                if (id) GLib.source_remove(id);
            }
            this._pendingTimeouts = [];

            if (this._settingsChangedId) {
                this._settings.disconnect(this._settingsChangedId);
                this._settingsChangedId = null;
            }

            this._unbindShortcut();
            this._restoreConflictingBindings();
            this._removeAltTabFilter();
            this._disconnectSignals();
            this._terminalWindow = null;
            this._settings = null;
        } catch (e) {
            console.error(`[Summon] disable() error: ${e.message}`);
        }
    }

    _isEnabled() {
        return this._enabled && this._settings !== null;
    }

    _getBoolSetting(key, fallback = false) {
        try {
            return this._settings.get_boolean(key);
        } catch (_e) {
            return fallback;
        }
    }

    // --- GNOME 45-49 API compatibility helpers ---

    _maximizeWindow(win) {
        if (typeof win.get_maximize_flags === 'function') {
            win.maximize();
        } else {
            win.maximize(MAXIMIZE_BOTH);
        }
    }

    _unmaximizeWindow(win) {
        if (typeof win.get_maximize_flags === 'function') {
            win.unmaximize();
        } else {
            win.unmaximize(MAXIMIZE_BOTH);
        }
    }

    _isWindowMaximized(win) {
        if (typeof win.get_maximize_flags === 'function') {
            return win.get_maximize_flags() !== 0;
        }
        return win.maximized_horizontally || win.maximized_vertically;
    }

    // --- Keybinding conflict management ---

    _removeConflictingBindings() {
        this._conflictsRemoved = [];

        if (!this._settings.get_boolean('remove-keybinding-conflicts')) return;

        const shortcut = this._settings.get_strv('toggle-dropdown')[0];
        if (!shortcut) return;

        const ibusKey = shortcut
            .replace(/<Super>/gi, 'Super+')
            .replace(/<Control>/gi, 'Control+')
            .replace(/<Alt>/gi, 'Alt+')
            .replace(/<Shift>/gi, 'Shift+')
            .replace(/<Meta>/gi, 'Meta+');

        try {
            const ibusSchema = 'org.freedesktop.ibus.general.hotkey';
            const ibusSettings = new Gio.Settings({ schema_id: ibusSchema });
            const triggers = ibusSettings.get_strv('trigger');
            if (triggers.includes(ibusKey)) {
                const filtered = triggers.filter(t => t !== ibusKey);
                ibusSettings.set_strv('trigger', filtered);
                this._conflictsRemoved.push({ schema: ibusSchema, key: 'trigger', value: ibusKey });
                console.debug(`[Summon] Removed conflicting IBus trigger: ${ibusKey}`);
            }
        } catch (_e) {
            // IBus not installed
        }

        try {
            const wmSchema = 'org.gnome.desktop.wm.keybindings';
            const wmSettings = new Gio.Settings({ schema_id: wmSchema });
            for (const wmKey of ['switch-input-source', 'switch-input-source-backward']) {
                const bindings = wmSettings.get_strv(wmKey);
                if (bindings.includes(shortcut)) {
                    const filtered = bindings.filter(b => b !== shortcut);
                    wmSettings.set_strv(wmKey, filtered);
                    this._conflictsRemoved.push({ schema: wmSchema, key: wmKey, value: shortcut });
                    console.debug(`[Summon] Removed conflicting WM binding: ${wmKey} = ${shortcut}`);
                }
            }
        } catch (_e) {
            // Schema not available
        }
    }

    _restoreConflictingBindings() {
        for (const conflict of this._conflictsRemoved) {
            try {
                const settings = new Gio.Settings({ schema_id: conflict.schema });
                const current = settings.get_strv(conflict.key);
                if (!current.includes(conflict.value)) {
                    current.push(conflict.value);
                    settings.set_strv(conflict.key, current);
                }
            } catch (_e) {
                // Schema not available
            }
        }
        this._conflictsRemoved = [];
    }

    // --- Keybinding ---

    _bindShortcut() {
        Main.wm.addKeybinding(
            this._keybindingId,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            () => this._toggle()
        );
    }

    _unbindShortcut() {
        try {
            Main.wm.removeKeybinding(this._keybindingId);
        } catch (_e) {
            // May not be bound
        }
    }

    // --- Signals ---

    _connectSignals() {
        this._windowCreatedId = global.display.connect(
            'window-created',
            (_, win) => this._onWindowCreated(win)
        );

        this._focusWindowId = global.display.connect(
            'notify::focus-window',
            () => this._onFocusChanged()
        );
    }

    _disconnectSignals() {
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }
        if (this._focusWindowId) {
            global.display.disconnect(this._focusWindowId);
            this._focusWindowId = null;
        }
        if (this._windowDestroyId && this._terminalWindow) {
            try {
                this._terminalWindow.disconnect(this._windowDestroyId);
            } catch (_e) {
                // Window may be destroyed
            }
            this._windowDestroyId = null;
        }
    }

    _onFocusChanged() {
        if (!this._isEnabled()) return;
        if (!this._terminalWindow) return;

        try {
            if (!this._getBoolSetting('auto-hide-on-focus-loss')) return;

            const focusedWindow = global.display.focus_window;
            if (focusedWindow !== this._terminalWindow && this._isWindowVisible()) {
                this._hideWindow();
            }
        } catch (e) {
            console.error(`[Summon] focus change error: ${e.message}`);
        }
    }

    _onSettingChanged(key) {
        if (!this._isEnabled()) return;

        switch (key) {
            case 'hide-from-taskbar':
            case 'always-on-top':
                if (this._terminalWindow) this._applyWindowProperties();
                break;
            case 'position':
            case 'width-percent':
            case 'height-percent':
            case 'fullscreen':
            case 'monitor':
            case 'follow-mouse':
                if (this._terminalWindow && this._isWindowVisible()) {
                    this._showWindow(this._terminalWindow);
                }
                break;
            case 'toggle-dropdown':
                this._unbindShortcut();
                this._restoreConflictingBindings();
                this._removeConflictingBindings();
                this._bindShortcut();
                break;
        }
    }

    // --- Window detection ---

    _findExistingWindow() {
        if (!this._isEnabled()) return;

        const existing = global.get_window_actors()
            .map(a => a.meta_window)
            .find(w => this._isDropdownWindow(w));

        if (existing) {
            this._attachWindow(existing);
        }
    }

    _isDropdownWindow(win) {
        if (!win) return false;
        try {
            return win.get_wm_class() === WM_CLASS;
        } catch (_e) {
            return false;
        }
    }

    _onWindowCreated(win) {
        if (!this._isEnabled()) return;
        if (this._terminalWindow) return;

        // Try immediate check — WM class may already be set
        try {
            if (this._isDropdownWindow(win)) {
                this._attachWindow(win);
                this._showWindow(win);
                return;
            }
        } catch (_e) {
            // WM class not set yet, fall through to deferred check
        }

        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            const idx = this._pendingTimeouts.indexOf(timeoutId);
            if (idx > -1) this._pendingTimeouts.splice(idx, 1);

            if (!this._isEnabled() || this._terminalWindow) return GLib.SOURCE_REMOVE;

            try {
                if (this._isDropdownWindow(win)) {
                    this._attachWindow(win);
                    this._showWindow(win);
                }
            } catch (e) {
                console.error(`[Summon] window created error: ${e.message}`);
            }
            return GLib.SOURCE_REMOVE;
        });

        this._pendingTimeouts.push(timeoutId);
    }

    _attachWindow(win) {
        if (!this._isEnabled()) return;

        // Disconnect old window signal if replacing
        if (this._windowDestroyId && this._terminalWindow) {
            try {
                this._terminalWindow.disconnect(this._windowDestroyId);
            } catch (_e) {
                // Old window may already be destroyed
            }
            this._windowDestroyId = null;
        }

        this._terminalWindow = win;
        this._windowDestroyId = win.connect('unmanaging', () => {
            this._terminalWindow = null;
            this._windowDestroyId = null;
        });

        this._applyWindowProperties();
    }

    // --- Window properties ---

    _applyWindowProperties() {
        if (!this._isEnabled()) return;
        if (!this._terminalWindow) return;

        try {
            const hideFromTaskbar = this._settings.get_boolean('hide-from-taskbar');
            const alwaysOnTop = this._getBoolSetting('always-on-top', true);

            if (hideFromTaskbar) {
                this._terminalWindow.stick();
                this._installAltTabFilter();
            } else {
                this._terminalWindow.unstick();
                this._removeAltTabFilter();
            }

            if (alwaysOnTop) {
                this._terminalWindow.make_above();
            } else {
                this._terminalWindow.unmake_above();
            }
        } catch (e) {
            console.error(`[Summon] window properties error: ${e.message}`);
        }
    }

    _installAltTabFilter() {
        // Hide from Alt+Tab
        if (!this._origGetWindows && AltTab.getWindows) {
            this._origGetWindows = AltTab.getWindows;
            AltTab.getWindows = (workspace) => { // eslint-disable-line no-import-assign
                return this._origGetWindows(workspace).filter(w =>
                    w.get_wm_class() !== WM_CLASS
                );
            };
        }

        // Hide from dash/panel (dash-to-panel, dash-to-dock, etc.)
        // Returns null only when NOT in Overview to avoid crashing the Overview renderer
        if (!this._origGetWindowApp) {
            const tracker = Shell.WindowTracker.get_default();
            this._origGetWindowApp = tracker.get_window_app.bind(tracker);
            tracker.get_window_app = (win) => {
                if (win && win.get_wm_class() === WM_CLASS &&
                    !Main.overview.visible && !Main.overview.animationInProgress) {
                    return null;
                }
                return this._origGetWindowApp(win);
            };
        }
    }

    _removeAltTabFilter() {
        if (this._origGetWindows) {
            AltTab.getWindows = this._origGetWindows; // eslint-disable-line no-import-assign
            this._origGetWindows = null;
        }

        if (this._origGetWindowApp) {
            const tracker = Shell.WindowTracker.get_default();
            tracker.get_window_app = this._origGetWindowApp;
            this._origGetWindowApp = null;
        }
    }

    // --- Monitor detection ---

    _getPointerMonitor() {
        const [pointerX, pointerY] = global.get_pointer();
        const nMonitors = global.display.get_n_monitors();
        for (let i = 0; i < nMonitors; i++) {
            const rect = global.display.get_monitor_geometry(i);
            if (pointerX >= rect.x && pointerX < rect.x + rect.width &&
                pointerY >= rect.y && pointerY < rect.y + rect.height) {
                return i;
            }
        }
        return global.display.get_current_monitor();
    }

    _isWindowOnCurrentContext() {
        if (!this._terminalWindow) return false;

        try {
            const win = this._terminalWindow;
            const activeWorkspace = global.workspace_manager.get_active_workspace();
            const onWorkspace = win.located_on_workspace(activeWorkspace);
            const currentMonitor = this._getPointerMonitor();
            const windowMonitor = win.get_monitor();

            return onWorkspace && currentMonitor === windowMonitor;
        } catch (_e) {
            return false;
        }
    }

    // --- Toggle logic ---

    _toggle() {
        if (!this._isEnabled()) return;

        try {
            const smartContextSwitch = this._settings.get_boolean('smart-context-switch');

            if (this._terminalWindow) {
                const isVisible = this._isWindowVisible();
                const isOnCurrentContext = this._isWindowOnCurrentContext();
                const isFocused = global.display.focus_window === this._terminalWindow;

                if (isVisible) {
                    if (isOnCurrentContext) {
                        if (isFocused) {
                            this._hideWindow();
                        } else if (smartContextSwitch) {
                            this._bringToFront();
                        } else {
                            this._hideWindow();
                        }
                    } else if (smartContextSwitch) {
                        this._showWindow(this._terminalWindow);
                    } else {
                        this._hideWindow();
                    }
                } else {
                    this._showWindow(this._terminalWindow);
                }
            } else {
                this._spawnTerminal();
            }
        } catch (e) {
            console.error(`[Summon] toggle error: ${e.message}`);
        }
    }

    _bringToFront() {
        if (!this._isEnabled()) return;
        if (!this._terminalWindow) return;

        try {
            if (this._getBoolSetting('always-on-top', true)) {
                this._terminalWindow.make_above();
            }
            this._terminalWindow.activate(global.get_current_time());
        } catch (e) {
            console.error(`[Summon] bring to front error: ${e.message}`);
        }
    }

    _isWindowVisible() {
        const win = this._terminalWindow;
        if (!win) return false;

        try {
            const activeWorkspace = global.workspace_manager.get_active_workspace();
            const onWorkspace = win.located_on_workspace(activeWorkspace);
            const minimized = win.minimized;
            const actor = win.get_compositor_private();

            return onWorkspace && !minimized && actor?.visible;
        } catch (_e) {
            return false;
        }
    }

    // --- Window positioning ---

    _getMonitorGeometry() {
        if (!this._isEnabled()) return null;

        const monitorSetting = this._settings.get_string('monitor');
        const followMouse = this._settings.get_boolean('follow-mouse');
        let monitorIndex;

        if (followMouse || monitorSetting === 'current') {
            monitorIndex = this._getPointerMonitor();
        } else if (monitorSetting === 'primary') {
            monitorIndex = global.display.get_primary_monitor();
        } else {
            monitorIndex = parseInt(monitorSetting) || 0;
        }

        const workspace = global.workspace_manager.get_active_workspace();
        return { geometry: workspace.get_work_area_for_monitor(monitorIndex), monitorIndex };
    }

    _activateWindow(win) {
        if (!this._isEnabled() || !win) return;
        if (this._getBoolSetting('always-on-top', true)) {
            win.make_above();
        }
        win.activate(global.get_current_time());
    }

    _getWindowRect(_win) {
        const monitorData = this._getMonitorGeometry();
        if (!monitorData) return null;

        const { geometry: geom, monitorIndex } = monitorData;
        const position = this._settings.get_string('position');
        const fullscreen = this._settings.get_boolean('fullscreen');

        if (fullscreen) {
            return { x: geom.x, y: geom.y, width: geom.width, height: geom.height, monitorIndex, fullscreen: true, position };
        }

        const widthPercent = this._settings.get_int('width-percent');
        const heightPercent = this._settings.get_int('height-percent');
        const width = Math.floor(geom.width * widthPercent / 100);
        const height = Math.floor(geom.height * heightPercent / 100);
        const x = geom.x + Math.floor((geom.width - width) / 2);
        const y = position === 'bottom'
            ? geom.y + geom.height - height
            : geom.y;

        return { x, y, width, height, monitorIndex, fullscreen: false, position };
    }

    _applyWindowRect(win, rect) {
        if (rect.fullscreen) {
            this._maximizeWindow(win);
        } else {
            if (this._isWindowMaximized(win)) {
                this._unmaximizeWindow(win);
            }
            win.move_resize_frame(false, rect.x, rect.y, rect.width, rect.height);
        }
    }

    // --- Animation ---

    _cancelPendingOperations(actor) {
        // Cancel all deferred monitor-move timeouts
        for (const id of this._pendingTimeouts) {
            if (id) GLib.source_remove(id);
        }
        this._pendingTimeouts = [];

        // Always reset actor state — translation_y may be set from
        // a pre-move hide or an in-progress animation
        if (actor) {
            actor.remove_all_transitions();
            actor.translation_y = 0;
        }
        this._animating = false;
    }

    _showWindow(win) {
        if (!this._isEnabled()) return;
        if (!win) return;

        try {
            const actor = win.get_compositor_private();
            this._cancelPendingOperations(actor);

            const workspace = global.workspace_manager.get_active_workspace();
            win.change_workspace(workspace);

            if (win.minimized) {
                win.unminimize();
            }

            const rect = this._getWindowRect(win);
            if (!rect) return;

            if (this._isWindowMaximized(win)) {
                this._unmaximizeWindow(win);
            }

            const needsMonitorMove = win.get_monitor() !== rect.monitorIndex;

            // Check if we actually need to resize
            const frame = win.get_frame_rect();
            const needsResize = !rect.fullscreen &&
                (frame.x !== rect.x || frame.y !== rect.y ||
                 frame.width !== rect.width || frame.height !== rect.height);

            if (needsMonitorMove && needsResize) {
                // Different monitor AND different size — hide, move, defer resize
                if (actor) {
                    actor.translation_y = rect.position === 'bottom' ? actor.height : -actor.height;
                }

                win.move_to_monitor(rect.monitorIndex);

                const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                    const idx = this._pendingTimeouts.indexOf(timeoutId);
                    if (idx > -1) this._pendingTimeouts.splice(idx, 1);
                    if (!this._isEnabled() || !win) return GLib.SOURCE_REMOVE;

                    this._applyWindowRect(win, rect);
                    this._activateWindow(win);
                    this._animateSlide(win, rect, true);
                    return GLib.SOURCE_REMOVE;
                });
                this._pendingTimeouts.push(timeoutId);
            } else if (needsMonitorMove) {
                // Different monitor, same size — just move and animate, no defer needed
                win.move_to_monitor(rect.monitorIndex);
                this._applyWindowRect(win, rect);
                this._activateWindow(win);
                this._animateSlide(win, rect, true);
            } else {
                // Same monitor
                this._applyWindowRect(win, rect);
                this._activateWindow(win);
                this._animateSlide(win, rect, true);
            }
        } catch (e) {
            console.error(`[Summon] show error: ${e.message}`);
        }
    }

    _hideWindow() {
        if (!this._isEnabled()) return;
        if (!this._terminalWindow) return;

        try {
            const win = this._terminalWindow;
            const actor = win.get_compositor_private();
            const duration = this._settings.get_int('animation-duration');

            this._cancelPendingOperations(actor);

            if (!actor || duration <= 0) {
                win.minimize();
                return;
            }
            this._animateSlide(win, null, false);
        } catch (e) {
            console.error(`[Summon] hide error: ${e.message}`);
        }
    }

    _animateSlide(win, rect, isShow) {
        const actor = win.get_compositor_private();
        if (!actor) return;

        const duration = this._settings.get_int('animation-duration');
        if (duration <= 0) return;

        const actorHeight = actor.height;
        const position = rect?.position ?? this._settings.get_string('position');
        const offset = position === 'bottom' ? actorHeight : -actorHeight;

        this._animating = true;

        if (isShow) {
            actor.translation_y = offset;
            actor.ease({
                translation_y: 0,
                duration,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => {
                    this._animating = false;
                },
            });
        } else {
            actor.ease({
                translation_y: offset,
                duration,
                mode: Clutter.AnimationMode.EASE_IN_CUBIC,
                onComplete: () => {
                    this._animating = false;
                    actor.translation_y = 0;
                    if (this._terminalWindow) {
                        this._terminalWindow.minimize();
                    }
                },
            });
        }
    }

    // --- Terminal spawning ---

    static KNOWN_TERMINALS = {
        'alacritty':      { argv: ['alacritty', '--class', WM_CLASS, '--title', WM_CLASS], execFlag: '-e' },
        'kitty':          { argv: ['kitty', '--class', WM_CLASS, '--title', WM_CLASS], execFlag: '--' },
        'wezterm':        { argv: ['wezterm', 'start', '--class', WM_CLASS], execFlag: '--' },
        'foot':           { argv: ['foot', '--app-id', WM_CLASS, '--title', WM_CLASS], execFlag: '--' },
        'gnome-terminal': { argv: ['gnome-terminal', '--class', WM_CLASS, '--title', WM_CLASS], execFlag: '--' },
        'ptyxis':         { argv: ['ptyxis', '--class', WM_CLASS, '--title', WM_CLASS], execFlag: '--' },
        'ghostty':        { argv: ['ghostty', '--class', WM_CLASS, '--title', WM_CLASS], execFlag: '-e' },
        'konsole':        { argv: ['konsole', '--name', WM_CLASS], execFlag: '-e' },
        'tilix':          { argv: ['tilix', '--class', WM_CLASS, '--title', WM_CLASS], execFlag: '-e' },
        'xfce4-terminal': { argv: ['xfce4-terminal', '--icon', WM_CLASS, '--title', WM_CLASS], execFlag: '-e' },
    };

    static PROBE_ORDER = [
        'alacritty', 'kitty', 'foot', 'wezterm', 'ghostty',
        'ptyxis', 'gnome-terminal', 'konsole', 'tilix', 'xfce4-terminal',
    ];

    _resolveTerminal() {
        const setting = this._settings.get_string('terminal');

        if (setting !== 'auto') {
            const known = DropdownTerminalExtension.KNOWN_TERMINALS[setting];
            if (known) return { argv: [...known.argv], execFlag: known.execFlag };

            // Custom command string
            try {
                const [ok, parsed] = GLib.shell_parse_argv(setting);
                if (ok) return { argv: parsed, execFlag: null };
            } catch (e) {
                console.warn(`[Summon] Failed to parse custom command: ${e.message}`);
            }
            return { argv: setting.split(/\s+/).filter(s => s), execFlag: null };
        }

        // Auto-detect: $TERMINAL env var
        const envTerminal = GLib.getenv('TERMINAL');
        if (envTerminal) {
            const name = GLib.path_get_basename(envTerminal);
            const known = DropdownTerminalExtension.KNOWN_TERMINALS[name];
            if (known) return { argv: [...known.argv], execFlag: known.execFlag };
            console.warn(`[Summon] Unknown terminal '${name}' from $TERMINAL — window detection requires WM class '${WM_CLASS}'`);
            return { argv: [envTerminal], execFlag: null };
        }

        // GNOME default terminal setting
        try {
            const gnomeTermSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.default-applications.terminal' });
            const gnomeDefault = gnomeTermSettings.get_string('exec');
            if (gnomeDefault && gnomeDefault !== 'xdg-terminal-exec') {
                const name = GLib.path_get_basename(gnomeDefault);
                const known = DropdownTerminalExtension.KNOWN_TERMINALS[name];
                if (known) return { argv: [...known.argv], execFlag: known.execFlag };
                return { argv: [gnomeDefault], execFlag: null };
            }
        } catch (_e) {
            // Schema not available
        }

        // Probe for installed terminals
        for (const name of DropdownTerminalExtension.PROBE_ORDER) {
            if (GLib.find_program_in_path(name)) {
                const known = DropdownTerminalExtension.KNOWN_TERMINALS[name];
                return { argv: [...known.argv], execFlag: known.execFlag };
            }
        }

        console.error('[Summon] No terminal emulator found');
        return null;
    }

    _spawnTerminal() {
        if (!this._isEnabled()) return;

        const resolved = this._resolveTerminal();
        if (!resolved) return;

        let { argv, execFlag } = resolved;

        // Append extra arguments
        const terminalArgs = this._settings.get_string('terminal-args');
        if (terminalArgs) {
            try {
                const [ok, parsed] = GLib.shell_parse_argv(terminalArgs);
                if (ok) argv = argv.concat(parsed);
            } catch (e) {
                console.warn(`[Summon] Failed to parse terminal-args: ${e.message}`);
                argv = argv.concat(terminalArgs.split(/\s+/).filter(s => s));
            }
        }

        // Append startup command
        const startupCommand = this._settings.get_string('startup-command');
        if (startupCommand) {
            try {
                const [ok, parsed] = GLib.shell_parse_argv(startupCommand);
                if (ok && parsed.length > 0) {
                    if (execFlag) argv.push(execFlag);
                    argv = argv.concat(parsed);
                }
            } catch (e) {
                console.warn(`[Summon] Failed to parse startup-command: ${e.message}`);
            }
        }

        GLib.spawn_async(
            null, argv, null,
            GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
            null
        );
    }
}
