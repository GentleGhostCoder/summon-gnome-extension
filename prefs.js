import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DropdownTerminalPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Terminal Page
        const terminalPage = new Adw.PreferencesPage({
            title: 'Terminal',
            icon_name: 'utilities-terminal-symbolic',
        });
        window.add(terminalPage);

        // Terminal Group
        const terminalGroup = new Adw.PreferencesGroup({
            title: 'Terminal Settings',
            description: 'Configure which terminal to use',
        });
        terminalPage.add(terminalGroup);

        // Terminal selector
        const terminalRow = new Adw.ComboRow({
            title: 'Terminal',
            subtitle: 'Select your preferred terminal emulator',
        });

        const terminals = [
            'auto', 'alacritty', 'kitty', 'foot', 'wezterm', 'ghostty',
            'ptyxis', 'gnome-terminal', 'konsole', 'tilix', 'xfce4-terminal', 'custom',
        ];
        const terminalLabels = terminals.map(t => {
            if (t === 'auto' || t === 'custom') return t;
            return GLib.find_program_in_path(t) ? t : `${t} (not found)`;
        });

        const terminalModel = new Gtk.StringList();
        terminalLabels.forEach(t => terminalModel.append(t));
        terminalRow.model = terminalModel;

        const currentTerminal = settings.get_string('terminal');
        const terminalIndex = terminals.indexOf(currentTerminal);
        terminalRow.selected = terminalIndex >= 0 ? terminalIndex : terminals.length - 1;

        terminalRow.connect('notify::selected', () => {
            const selected = terminals[terminalRow.selected];
            if (selected !== 'custom') {
                settings.set_string('terminal', selected);
            }
            customRow.sensitive = selected === 'custom';
        });
        terminalGroup.add(terminalRow);

        // Custom terminal command
        const customRow = new Adw.EntryRow({
            title: 'Custom Command (must include --class dropdown-terminal)',
        });
        customRow.text = terminals.includes(currentTerminal) ? '' : currentTerminal;
        customRow.sensitive = terminalRow.selected === terminals.length - 1;
        customRow.connect('changed', () => {
            if (terminals[terminalRow.selected] === 'custom') {
                settings.set_string('terminal', customRow.text);
            }
        });
        terminalGroup.add(customRow);

        // Extra arguments
        const argsRow = new Adw.EntryRow({
            title: 'Extra Arguments',
        });
        argsRow.text = settings.get_string('terminal-args');
        argsRow.connect('changed', () => {
            settings.set_string('terminal-args', argsRow.text);
        });
        terminalGroup.add(argsRow);

        // Startup command
        const startupRow = new Adw.EntryRow({
            title: 'Startup Command (e.g., tmux new-session -A -s main)',
        });
        startupRow.text = settings.get_string('startup-command');
        startupRow.connect('changed', () => {
            settings.set_string('startup-command', startupRow.text);
        });
        terminalGroup.add(startupRow);

        // Appearance Page
        const appearancePage = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'preferences-desktop-appearance-symbolic',
        });
        window.add(appearancePage);

        // Size Group
        const sizeGroup = new Adw.PreferencesGroup({
            title: 'Window Size',
            description: 'Configure dropdown window dimensions',
        });
        appearancePage.add(sizeGroup);

        // Fullscreen toggle
        const fullscreenRow = new Adw.SwitchRow({
            title: 'Fullscreen',
            subtitle: 'Maximize terminal to fill the work area (respects panel/dock)',
        });
        settings.bind('fullscreen', fullscreenRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        sizeGroup.add(fullscreenRow);

        // Width
        const widthRow = new Adw.SpinRow({
            title: 'Width',
            subtitle: 'Percentage of monitor width',
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 100,
                step_increment: 5,
                value: settings.get_int('width-percent'),
            }),
        });
        settings.bind('width-percent', widthRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        sizeGroup.add(widthRow);

        // Height
        const heightRow = new Adw.SpinRow({
            title: 'Height',
            subtitle: 'Percentage of monitor height',
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 100,
                step_increment: 5,
                value: settings.get_int('height-percent'),
            }),
        });
        settings.bind('height-percent', heightRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        sizeGroup.add(heightRow);

        // Grey out width/height when fullscreen is on
        const updateSizeRows = () => {
            const fs = settings.get_boolean('fullscreen');
            widthRow.sensitive = !fs;
            heightRow.sensitive = !fs;
        };
        settings.connect('changed::fullscreen', updateSizeRows);
        updateSizeRows();

        // Animation Group
        const animGroup = new Adw.PreferencesGroup({
            title: 'Animation',
            description: 'Slide animation when showing/hiding the terminal',
        });
        appearancePage.add(animGroup);

        const animRow = new Adw.SpinRow({
            title: 'Animation Duration',
            subtitle: 'Milliseconds (0 to disable)',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 500,
                step_increment: 25,
                value: settings.get_int('animation-duration'),
            }),
        });
        settings.bind('animation-duration', animRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        animGroup.add(animRow);

        // Position Group
        const positionGroup = new Adw.PreferencesGroup({
            title: 'Position',
        });
        appearancePage.add(positionGroup);

        // Position selector
        const positionRow = new Adw.ComboRow({
            title: 'Position',
            subtitle: 'Where the terminal appears',
        });
        const positionModel = new Gtk.StringList();
        ['top', 'bottom'].forEach(p => positionModel.append(p));
        positionRow.model = positionModel;
        positionRow.selected = settings.get_string('position') === 'bottom' ? 1 : 0;
        positionRow.connect('notify::selected', () => {
            settings.set_string('position', positionRow.selected === 0 ? 'top' : 'bottom');
        });
        positionGroup.add(positionRow);

        // Monitor selector
        const monitorRow = new Adw.ComboRow({
            title: 'Monitor',
            subtitle: 'Which monitor to show terminal on (when Follow Mouse is off)',
        });
        const monitorModel = new Gtk.StringList();
        ['current', 'primary', '0', '1', '2', '3'].forEach(m => monitorModel.append(m));
        monitorRow.model = monitorModel;

        const monitorOptions = ['current', 'primary', '0', '1', '2', '3'];
        const currentMonitor = settings.get_string('monitor');
        monitorRow.selected = monitorOptions.indexOf(currentMonitor);
        if (monitorRow.selected < 0) monitorRow.selected = 0;

        monitorRow.connect('notify::selected', () => {
            settings.set_string('monitor', monitorOptions[monitorRow.selected]);
        });
        positionGroup.add(monitorRow);

        // Behavior Page
        const behaviorPage = new Adw.PreferencesPage({
            title: 'Behavior',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(behaviorPage);

        // Mouse & Monitor Group
        const mouseGroup = new Adw.PreferencesGroup({
            title: 'Mouse & Monitor Behavior',
            description: 'Control how the terminal follows your focus',
        });
        behaviorPage.add(mouseGroup);

        // Follow mouse
        const followMouseRow = new Adw.SwitchRow({
            title: 'Follow Mouse',
            subtitle: 'Terminal appears on monitor where mouse cursor is',
        });
        settings.bind('follow-mouse', followMouseRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        mouseGroup.add(followMouseRow);

        // Smart context switch
        const smartSwitchRow = new Adw.SwitchRow({
            title: 'Smart Context Switch',
            subtitle: 'When terminal is visible on another monitor, shortcut moves it here instead of hiding',
        });
        settings.bind('smart-context-switch', smartSwitchRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        mouseGroup.add(smartSwitchRow);

        // Window Behavior Group
        const windowGroup = new Adw.PreferencesGroup({
            title: 'Window Behavior',
        });
        behaviorPage.add(windowGroup);

        // Always on top
        const alwaysOnTopRow = new Adw.SwitchRow({
            title: 'Always on Top',
            subtitle: 'Keep terminal above other windows',
        });
        settings.bind('always-on-top', alwaysOnTopRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        windowGroup.add(alwaysOnTopRow);

        // Auto-hide on focus loss
        const autoHideRow = new Adw.SwitchRow({
            title: 'Auto-Hide on Focus Loss',
            subtitle: 'Hide terminal when clicking elsewhere',
        });
        settings.bind('auto-hide-on-focus-loss', autoHideRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        windowGroup.add(autoHideRow);

        // Hide from taskbar
        const hideTaskbarRow = new Adw.SwitchRow({
            title: 'Hide from Taskbar',
            subtitle: 'Hide from dash, panel, and Alt+Tab',
        });
        settings.bind('hide-from-taskbar', hideTaskbarRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        windowGroup.add(hideTaskbarRow);

        // Remove keybinding conflicts
        const conflictsRow = new Adw.SwitchRow({
            title: 'Remove Keybinding Conflicts',
            subtitle: 'Automatically remove IBus and input-source shortcuts that conflict with the toggle key',
        });
        settings.bind('remove-keybinding-conflicts', conflictsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        windowGroup.add(conflictsRow);

        // Shortcut Page
        const shortcutPage = new Adw.PreferencesPage({
            title: 'Shortcut',
            icon_name: 'input-keyboard-symbolic',
        });
        window.add(shortcutPage);

        const shortcutGroup = new Adw.PreferencesGroup({
            title: 'Keyboard Shortcut',
            description: 'Press the shortcut to toggle the dropdown terminal',
        });
        shortcutPage.add(shortcutGroup);

        // Shortcut display
        const currentShortcut = settings.get_strv('toggle-dropdown')[0] || '';

        const shortcutRow = new Adw.ActionRow({
            title: 'Toggle Shortcut',
            subtitle: currentShortcut || 'Not set',
        });

        const shortcutButton = new Gtk.Button({
            label: 'Set Shortcut',
            valign: Gtk.Align.CENTER,
        });

        shortcutButton.connect('clicked', () => {
            this._showShortcutDialog(window, settings, shortcutRow);
        });

        shortcutRow.add_suffix(shortcutButton);
        shortcutGroup.add(shortcutRow);

        // Reset button
        const resetRow = new Adw.ActionRow({
            title: 'Reset Shortcut',
            subtitle: 'Reset to default (Ctrl+Enter)',
        });

        const resetButton = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });

        resetButton.connect('clicked', () => {
            settings.set_strv('toggle-dropdown', ['<Control>Return']);
            shortcutRow.subtitle = '<Control>Return';
        });

        resetRow.add_suffix(resetButton);
        shortcutGroup.add(resetRow);
    }

    _showShortcutDialog(window, settings, shortcutRow) {
        const dialog = new Adw.MessageDialog({
            heading: 'Set Shortcut',
            body: 'Press the key combination you want to use',
            transient_for: window,
            modal: true,
        });

        dialog.add_response('cancel', 'Cancel');

        const controller = new Gtk.EventControllerKey();
        controller.connect('key-pressed', (_, keyval, keycode, state) => {
            const mask = state & Gtk.accelerator_get_default_mod_mask();

            if (keyval === 65307 && mask === 0) {
                dialog.close();
                return true;
            }

            const isModifierOnly = [
                65505, 65506, 65507, 65508,
                65513, 65514, 65515, 65516,
                65511, 65512,
            ].includes(keyval);

            if (isModifierOnly) return true;

            const isFunctionKey = keyval >= 65470 && keyval <= 65481;
            if (mask === 0 && !isFunctionKey) return true;

            const accel = Gtk.accelerator_name(keyval, mask);
            if (accel && accel !== '') {
                settings.set_strv('toggle-dropdown', [accel]);
                shortcutRow.subtitle = accel;
                dialog.close();
            }
            return true;
        });

        dialog.add_controller(controller);
        dialog.present();
    }
}
